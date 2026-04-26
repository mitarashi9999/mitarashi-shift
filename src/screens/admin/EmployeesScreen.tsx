import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { EmployeeCard } from "@/components/EmployeeCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FormInput } from "@/components/FormInput";
import { Header } from "@/components/Header";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { PrimaryButton } from "@/components/PrimaryButton";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/types/app";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

const PROFILE_COLUMNS =
  "id, role, name, employee_code, phone, department, status";
const REQUEST_TIMEOUT_MS = 10000;
const EMPLOYEES_API_URL = (process.env.EXPO_PUBLIC_EMPLOYEES_API_URL || "/api/employees").trim();
const APP_READ_TOKEN = (process.env.EXPO_PUBLIC_APP_READ_TOKEN || "").trim();
const APP_WRITE_TOKEN = (process.env.EXPO_PUBLIC_APP_WRITE_TOKEN || "").trim();

type EmployeeForm = {
  name: string;
  employeeCode: string;
  phone: string;
  department: string;
};

type EmployeesApiResult = {
  ok: boolean;
  employees?: Profile[];
  employee?: Profile;
  error?: string;
  message?: string;
};

const EMPTY_FORM: EmployeeForm = {
  name: "",
  employeeCode: "",
  phone: "",
  department: ""
};

async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutCode: string,
  timeoutMs = REQUEST_TIMEOUT_MS
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutCode)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function createUuidV4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function isProfilesTableMissing(message: string) {
  return (
    message.includes("Could not find the table 'public.profiles'") ||
    message.includes("relation \"public.profiles\" does not exist") ||
    message.includes("public.profiles")
  );
}

function isPermissionError(message: string) {
  return (
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("not allowed")
  );
}

function formatAddEmployeeError(message: string) {
  if (isProfilesTableMissing(message)) {
    return "profilesテーブルが存在しません。Supabaseでテーブル作成後に再実行してください。";
  }
  if (message.includes("duplicate key")) {
    return "社員コードが重複しています。別の社員コードで登録してください。";
  }
  if (isPermissionError(message)) {
    return "権限設定で拒否されました。APIルート設定またはRLS設定を確認してください。";
  }
  if (message.includes("foreign key")) {
    return "profiles.id の外部キー制約で拒否されました。APIルートを使って再実行してください。";
  }
  return `従業員追加に失敗しました: ${message}`;
}

function shouldFallbackToDirectSupabase(apiErrorMessage: string) {
  return (
    apiErrorMessage.includes("Failed to fetch") ||
    apiErrorMessage.includes("EMPLOYEES_API_TIMEOUT") ||
    apiErrorMessage.includes("EMPLOYEES_API_URL_UNAVAILABLE")
  );
}

function formatEmployeesApiError(message: string) {
  if (message.includes("service_role_missing")) {
    return "Vercelに SUPABASE_SERVICE_ROLE_KEY（または SUPABASE_SECRET_KEY）が未設定です。";
  }
  if (message.includes("unauthorized_write_token")) {
    return "API書き込みトークンが不一致です。APP_WRITE_TOKEN と EXPO_PUBLIC_APP_WRITE_TOKEN を揃えてください。";
  }
  if (message.includes("unauthorized_read_token")) {
    return "API読み取りトークンが不一致です。APP_READ_TOKEN と EXPO_PUBLIC_APP_READ_TOKEN を揃えてください。";
  }
  return `API経由の処理に失敗しました: ${message}`;
}

function sortEmployees(rows: Profile[]) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function buildApiUrl(baseUrl: string, employeeId?: string) {
  if (!baseUrl) {
    return "";
  }
  const isAbsolute = /^https?:\/\//i.test(baseUrl);
  const isRelativeWeb = Platform.OS === "web" && baseUrl.startsWith("/");
  if (!isAbsolute && !isRelativeWeb) {
    return "";
  }

  if (!employeeId) {
    return baseUrl;
  }
  const joiner = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${joiner}id=${encodeURIComponent(employeeId)}`;
}

async function requestEmployeesApi(
  method: "GET" | "POST" | "DELETE",
  payload?: Record<string, unknown>,
  employeeId?: string
) {
  const endpoint = buildApiUrl(EMPLOYEES_API_URL, employeeId);
  if (!endpoint) {
    throw new Error("EMPLOYEES_API_URL_UNAVAILABLE");
  }

  const response = await withTimeout(
    fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(APP_READ_TOKEN ? { "x-app-token": APP_READ_TOKEN } : {}),
        ...(APP_WRITE_TOKEN ? { "x-app-write-token": APP_WRITE_TOKEN } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    }),
    "EMPLOYEES_API_TIMEOUT"
  );

  const text = await response.text();
  let json: EmployeesApiResult | null = null;
  try {
    json = text ? (JSON.parse(text) as EmployeesApiResult) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const bodyMessage =
      json?.message || json?.error || text || `${response.status} ${response.statusText}`;
    throw new Error(bodyMessage);
  }

  if (!json || !json.ok) {
    throw new Error(json?.message || json?.error || "EMPLOYEES_API_FAILED");
  }

  return json;
}

export function EmployeesScreen() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const hasEmployeesApi = useMemo(() => Boolean(buildApiUrl(EMPLOYEES_API_URL)), []);

  const loadEmployeesFromSupabase = useCallback(async () => {
    if (!supabase) {
      throw new Error("SUPABASE_NOT_CONFIGURED");
    }
    const requestPromise = supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("role", "employee")
      .order("name", { ascending: true })
      .then((result) => ({
        data: (result.data ?? null) as Profile[] | null,
        error: result.error ? { message: result.error.message } : null
      }));
    const { data, error: fetchError } = await withTimeout(
      requestPromise,
      "REQUEST_TIMEOUT"
    );
    if (fetchError) {
      throw new Error(fetchError.message);
    }
    return sortEmployees(data ?? []);
  }, []);

  const loadEmployees = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      setIsTimedOut(false);

      if (hasEmployeesApi) {
        try {
          const apiResult = await requestEmployeesApi("GET");
          setEmployees(sortEmployees(apiResult.employees ?? []));
          return;
        } catch (apiCause) {
          const apiMessage =
            apiCause instanceof Error ? apiCause.message : "Unknown employees api error";
          if (!shouldFallbackToDirectSupabase(apiMessage)) {
            throw new Error(formatEmployeesApiError(apiMessage));
          }
        }
      }

      const rows = await loadEmployeesFromSupabase();
      setEmployees(rows);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unknown employees fetch error";
      if (message.includes("REQUEST_TIMEOUT") || message.includes("EMPLOYEES_API_TIMEOUT")) {
        setEmployees([]);
        setError(null);
        setIsTimedOut(true);
      } else if (isProfilesTableMissing(message)) {
        setEmployees([]);
        setError("profilesテーブルが見つかりません。Supabase SQLを先に実行してください。");
      } else if (message.includes("SUPABASE_NOT_CONFIGURED")) {
        setEmployees([]);
        setError("Supabase未設定です。.env / Vercel Environment Variables を確認してください。");
      } else if (isPermissionError(message)) {
        setEmployees([]);
        setError("権限で従業員取得に失敗しました。RLS設定または /api/employees の設定を確認してください。");
      } else {
        setEmployees([]);
        setError(`従業員の取得に失敗しました: ${message}`);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [hasEmployeesApi, loadEmployeesFromSupabase]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const handleAddPress = useCallback(() => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setAddModalVisible(true);
  }, []);

  const handleChangeForm = useCallback(
    (key: keyof EmployeeForm, value: string) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const closeAddModal = useCallback(() => {
    if (isAdding) {
      return;
    }
    setAddModalVisible(false);
  }, [isAdding]);

  const handleSubmitAdd = useCallback(async () => {
    const name = form.name.trim();
    if (!name) {
      setFormError("氏名は必須です。");
      return;
    }

    setIsAdding(true);
    setFormError(null);

    try {
      if (hasEmployeesApi) {
        try {
          const apiResult = await requestEmployeesApi("POST", {
            name,
            employeeCode: form.employeeCode.trim() || null,
            phone: form.phone.trim() || null,
            department: form.department.trim() || null
          });
          const created = apiResult.employee;
          if (!created) {
            throw new Error("APIから追加結果が返ってきませんでした。");
          }
          setEmployees((current) =>
            sortEmployees([...current.filter((item) => item.id !== created.id), created])
          );
          setError(null);
          setIsTimedOut(false);
          setAddModalVisible(false);
          setForm(EMPTY_FORM);
          return;
        } catch (apiCause) {
          const apiMessage =
            apiCause instanceof Error ? apiCause.message : "Unknown employees api error";
          if (!shouldFallbackToDirectSupabase(apiMessage)) {
            throw new Error(formatEmployeesApiError(apiMessage));
          }
        }
      }

      if (!supabase) {
        throw new Error("SUPABASE_NOT_CONFIGURED");
      }

      const requestPromise = supabase
        .from("profiles")
        .upsert(
          {
            id: createUuidV4(),
            role: "employee",
            name,
            employee_code: form.employeeCode.trim() || null,
            phone: form.phone.trim() || null,
            department: form.department.trim() || null,
            status: "active"
          },
          { onConflict: "id" }
        )
        .select(PROFILE_COLUMNS)
        .single()
        .then((result) => ({
          data: (result.data ?? null) as Profile | null,
          error: result.error ? { message: result.error.message } : null
        }));

      const { data, error: addError } = await withTimeout(
        requestPromise,
        "PROFILE_UPSERT_TIMEOUT"
      );

      if (addError) {
        throw new Error(addError.message);
      }
      if (!data) {
        throw new Error("従業員追加に失敗しました。");
      }

      setEmployees((current) =>
        sortEmployees([...current.filter((item) => item.id !== data.id), data])
      );
      setError(null);
      setIsTimedOut(false);
      setAddModalVisible(false);
      setForm(EMPTY_FORM);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown add employee error";
      if (message.includes("PROFILE_UPSERT_TIMEOUT") || message.includes("EMPLOYEES_API_TIMEOUT")) {
        setFormError("従業員追加がタイムアウトしました。通信状態を確認してください。");
      } else if (message.includes("SUPABASE_NOT_CONFIGURED")) {
        setFormError("Supabase未設定のため追加できません。");
      } else {
        setFormError(formatAddEmployeeError(message));
      }
    } finally {
      setIsAdding(false);
    }
  }, [form, hasEmployeesApi]);

  const deleteEmployee = useCallback(
    async (employee: Profile) => {
      try {
        if (hasEmployeesApi) {
          try {
            await requestEmployeesApi("DELETE", undefined, employee.id);
            setEmployees((current) => current.filter((item) => item.id !== employee.id));
            setError(null);
            return;
          } catch (apiCause) {
            const apiMessage =
              apiCause instanceof Error ? apiCause.message : "Unknown employees api error";
            if (!shouldFallbackToDirectSupabase(apiMessage)) {
              throw new Error(formatEmployeesApiError(apiMessage));
            }
          }
        }

        if (!supabase) {
          throw new Error("SUPABASE_NOT_CONFIGURED");
        }
        const { error: deleteError } = await supabase
          .from("profiles")
          .delete()
          .eq("id", employee.id);
        if (deleteError) {
          throw new Error(deleteError.message);
        }
        setEmployees((current) => current.filter((item) => item.id !== employee.id));
        setError(null);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Unknown delete error";
        setError(`削除に失敗しました: ${message}`);
      }
    },
    [hasEmployeesApi]
  );

  const handleEmployeePress = useCallback(
    (employee: Profile) => {
      const message =
        `${employee.name}\n部署: ${employee.department || "未設定"}\n` +
        `社員コード: ${employee.employee_code || "未設定"}\n` +
        "削除する場合は「削除」を押してください。";

      if (Platform.OS === "web") {
        const shouldDelete = window.confirm(
          `${message.replace(/\n/g, "\n\n")}\n\nこの従業員を削除しますか？`
        );
        if (shouldDelete) {
          void deleteEmployee(employee);
        }
        return;
      }

      Alert.alert("従業員詳細", message, [
        { text: "閉じる", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: () => void deleteEmployee(employee)
        }
      ]);
    },
    [deleteEmployee]
  );

  if (isLoading) {
    return <LoadingOverlay message="従業員を読み込んでいます..." />;
  }

  return (
    <View style={styles.container}>
      <Header title="従業員" subtitle="カードをタップすると詳細と削除操作を開けます" />
      <PrimaryButton label="従業員を追加" onPress={handleAddPress} />
      {error ? <ErrorBanner message={error} /> : null}
      <FlatList
        contentContainerStyle={styles.list}
        data={employees}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadEmployees(true)}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <EmployeeCard employee={item} onPress={() => handleEmployeePress(item)} />
        )}
        ListEmptyComponent={
          <EmptyState
            title="従業員がまだいません"
            description={
              isTimedOut
                ? "通信がタイムアウトしました。画面を下に引っ張って再読み込みしてください。"
                : "「従業員を追加」から登録できます。"
            }
          />
        }
      />

      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeAddModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>従業員を追加</Text>
              <Text style={styles.modalHint}>
                氏名などの基本情報を入力して従業員を追加してください。
              </Text>
              {formError ? <ErrorBanner message={formError} /> : null}

              <FormInput
                label="氏名 (必須)"
                value={form.name}
                onChangeText={(value) => handleChangeForm("name", value)}
                placeholder="例: 山田 太郎"
              />
              <FormInput
                label="社員コード"
                value={form.employeeCode}
                onChangeText={(value) => handleChangeForm("employeeCode", value)}
                placeholder="例: E001"
              />
              <FormInput
                label="部署"
                value={form.department}
                onChangeText={(value) => handleChangeForm("department", value)}
                placeholder="例: ホール"
              />
              <FormInput
                label="電話番号"
                value={form.phone}
                onChangeText={(value) => handleChangeForm("phone", value)}
                placeholder="例: 09012345678"
              />
              <View style={styles.modalActions}>
                <PrimaryButton
                  label="キャンセル"
                  onPress={closeAddModal}
                  variant="secondary"
                  disabled={isAdding}
                />
                <PrimaryButton
                  label={isAdding ? "追加中..." : "追加する"}
                  onPress={() => void handleSubmitAdd()}
                  disabled={isAdding}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.md
  },
  list: {
    paddingTop: spacing.sm,
    gap: spacing.md,
    paddingBottom: spacing.xl
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%"
  },
  modalContent: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xl + spacing.md
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text
  },
  modalHint: {
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 20
  },
  modalActions: {
    gap: spacing.sm,
    marginTop: spacing.sm
  }
});
