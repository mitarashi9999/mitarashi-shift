import React, { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
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
const LOCAL_EMPLOYEES_KEY = "shift_local_employees_v1";

type EmployeeForm = {
  name: string;
  employeeCode: string;
  phone: string;
  department: string;
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

function formatAddEmployeeError(message: string) {
  if (message.includes("duplicate key")) {
    return "社員コードが重複しています。別の社員コードを入力してください。";
  }
  if (message.includes("row-level security")) {
    return "権限エラーです。管理者アカウントでログインし直してください。";
  }
  if (message.includes("foreign key constraint")) {
    return "従業員追加に必要な関連データ作成に失敗しました。SupabaseのAuth設定を確認してください。";
  }
  return `従業員追加に失敗しました: ${message}`;
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

function buildLocalEmployee(form: EmployeeForm): Profile {
  return {
    id: `local-employee-${createUuidV4()}`,
    role: "employee",
    name: form.name.trim(),
    employee_code: form.employeeCode.trim() || null,
    phone: form.phone.trim() || null,
    department: form.department.trim() || null,
    status: "active"
  };
}

async function readLocalEmployees() {
  const raw = await AsyncStorage.getItem(LOCAL_EMPLOYEES_KEY);
  if (!raw) {
    return [] as Profile[];
  }
  try {
    const parsed = JSON.parse(raw) as Profile[];
    if (!Array.isArray(parsed)) {
      return [] as Profile[];
    }
    return parsed.filter((row) => row?.role === "employee");
  } catch {
    return [] as Profile[];
  }
}

async function writeLocalEmployees(employees: Profile[]) {
  await AsyncStorage.setItem(LOCAL_EMPLOYEES_KEY, JSON.stringify(employees));
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
  const [isLocalMode, setIsLocalMode] = useState(false);

  const loadEmployees = useCallback(async (refresh = false) => {
    if (!supabase || isLocalMode) {
      const locals = await readLocalEmployees();
      setEmployees(locals);
      setError(
        isLocalMode
          ? "Supabaseのprofilesテーブルが未作成のため、ローカル保存モードで動作中です。"
          : "Supabase未接続のため、ローカル保存モードで動作中です。"
      );
      setIsTimedOut(false);
      setIsLoading(false);
      return;
    }

    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
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
        if (isProfilesTableMissing(fetchError.message)) {
          const locals = await readLocalEmployees();
          setEmployees(locals);
          setIsLocalMode(true);
          setError("profilesテーブルが未作成のため、ローカル保存モードに切り替えました。");
          setIsTimedOut(false);
          return;
        }
        setEmployees([]);
        setError(`従業員の取得に失敗しました: ${fetchError.message}`);
        setIsTimedOut(false);
        return;
      }

      setEmployees(data ?? []);
      setError(null);
      setIsTimedOut(false);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unknown employees fetch error";
      if (message.includes("REQUEST_TIMEOUT")) {
        setEmployees([]);
        setError(null);
        setIsTimedOut(true);
      } else if (isProfilesTableMissing(message)) {
        const locals = await readLocalEmployees();
        setEmployees(locals);
        setIsLocalMode(true);
        setError("profilesテーブルが未作成のため、ローカル保存モードに切り替えました。");
        setIsTimedOut(false);
      } else {
        setError(`従業員の取得に失敗しました: ${message}`);
        setIsTimedOut(false);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isLocalMode]);

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
      if (!supabase || isLocalMode) {
        const localEmployee = buildLocalEmployee(form);
        const nextEmployees = [...employees, localEmployee].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        await writeLocalEmployees(nextEmployees);
        setEmployees(nextEmployees);
        setIsLocalMode(true);
        setError("ローカル保存モードで従業員を追加しました。");
        setIsTimedOut(false);
        setAddModalVisible(false);
        setForm(EMPTY_FORM);
        return;
      }
      const client = supabase;

      const createProfile = async (targetUserId: string) => {
        const requestPromise = client
          .from("profiles")
          .upsert(
            {
              id: targetUserId,
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
        return withTimeout(requestPromise, "PROFILE_UPSERT_TIMEOUT");
      };

      let createdProfile: Profile | null = null;
      const optimisticUserId = createUuidV4();
      const firstTry = await createProfile(optimisticUserId);

      if (firstTry.error && isProfilesTableMissing(firstTry.error.message)) {
        const localEmployee = buildLocalEmployee(form);
        const nextEmployees = [...employees, localEmployee].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        await writeLocalEmployees(nextEmployees);
        setEmployees(nextEmployees);
        setIsLocalMode(true);
        setError("profilesテーブル未作成のため、ローカル保存モードへ切り替えて追加しました。");
        setIsTimedOut(false);
        setAddModalVisible(false);
        setForm(EMPTY_FORM);
        return;
      } else {
        if (firstTry.error) {
          setFormError(formatAddEmployeeError(firstTry.error.message));
          return;
        }
        createdProfile = firstTry.data;
      }

      if (!createdProfile) {
        setFormError("従業員の追加に失敗しました。");
        return;
      }

      setEmployees((current) =>
        [
          ...current.filter((item) => item.id !== createdProfile.id),
          createdProfile
        ].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setError(null);
      setIsTimedOut(false);
      setAddModalVisible(false);
      setForm(EMPTY_FORM);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unknown add employee error";
      if (message.includes("PROFILE_UPSERT_TIMEOUT")) {
        setFormError(
          "プロフィール保存がタイムアウトしました。通信状態を確認して再試行してください。"
        );
      } else if (isProfilesTableMissing(message)) {
        const localEmployee = buildLocalEmployee(form);
        const nextEmployees = [...employees, localEmployee].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        await writeLocalEmployees(nextEmployees);
        setEmployees(nextEmployees);
        setIsLocalMode(true);
        setError("profilesテーブル未作成のため、ローカル保存モードへ切り替えて追加しました。");
        setIsTimedOut(false);
        setAddModalVisible(false);
        setForm(EMPTY_FORM);
      } else if (message.includes("REQUEST_TIMEOUT")) {
        setFormError("追加処理がタイムアウトしました。通信を確認して再試行してください。");
      } else {
        setFormError(formatAddEmployeeError(message));
      }
    } finally {
      setIsAdding(false);
    }
  }, [employees, form, isLocalMode]);

  const deleteEmployee = useCallback(async (employee: Profile) => {
    if (!supabase || isLocalMode || employee.id.startsWith("local-employee-")) {
      const nextEmployees = employees.filter((item) => item.id !== employee.id);
      await writeLocalEmployees(nextEmployees);
      setEmployees(nextEmployees);
      setError(isLocalMode ? "ローカル保存モードで削除しました。" : null);
      return;
    }

    const { error: deleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", employee.id);

    if (deleteError) {
      setError(`削除に失敗しました: ${deleteError.message}`);
      return;
    }

    setEmployees((current) => current.filter((item) => item.id !== employee.id));
    setError(null);
  }, [employees, isLocalMode]);

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
                ? "通信が不安定です。画面を下に引っ張って再読み込みしてください。"
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
