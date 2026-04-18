import React, { useCallback, useEffect, useState } from "react";
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
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmployeeForm = {
  email: string;
  password: string;
  name: string;
  employeeCode: string;
  phone: string;
  department: string;
};

const EMPTY_FORM: EmployeeForm = {
  email: "",
  password: "",
  name: "",
  employeeCode: "",
  phone: "",
  department: ""
};

function formatAddEmployeeError(message: string) {
  if (message.includes("already registered")) {
    return "このメールアドレスはすでに登録済みです。";
  }
  if (message.includes("Password")) {
    return "パスワード要件を満たしていません。8文字以上で入力してください。";
  }
  if (message.includes("signups not allowed")) {
    return "現在このプロジェクトでは新規登録が無効です。SupabaseのAuth設定を確認してください。";
  }
  if (message.includes("duplicate key")) {
    return "社員コードが重複しています。別の社員コードを入力してください。";
  }
  if (message.includes("row-level security")) {
    return "権限エラーです。管理者アカウントでログインし直してください。";
  }
  return `従業員追加に失敗しました: ${message}`;
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

  const loadEmployees = useCallback(async (refresh = false) => {
    if (!supabase) {
      setEmployees([]);
      setError("Supabase設定を確認してください。");
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

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), REQUEST_TIMEOUT_MS);
      });

      const { data, error: fetchError } = await Promise.race([
        requestPromise,
        timeoutPromise
      ]);

      if (fetchError) {
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
      } else {
        setError(`従業員の取得に失敗しました: ${message}`);
        setIsTimedOut(false);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

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
    if (!supabase) {
      setFormError("Supabase設定を確認してください。");
      return;
    }

    const email = form.email.trim().toLowerCase();
    const password = form.password.trim();
    const name = form.name.trim();

    if (!EMAIL_REGEX.test(email)) {
      setFormError("メールアドレスの形式が正しくありません。");
      return;
    }
    if (password.length < 8) {
      setFormError("初期パスワードは8文字以上で入力してください。");
      return;
    }
    if (!name) {
      setFormError("氏名は必須です。");
      return;
    }

    setIsAdding(true);
    setFormError(null);

    try {
      const {
        data: { session: sessionBefore }
      } = await supabase.auth.getSession();

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password
      });
      if (signUpError) {
        setFormError(formatAddEmployeeError(signUpError.message));
        return;
      }

      const createdUserId = signUpData.user?.id;
      if (!createdUserId) {
        setFormError("従業員ユーザーの作成に失敗しました。");
        return;
      }

      const requestPromise = supabase
        .from("profiles")
        .upsert(
          {
            id: createdUserId,
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

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), REQUEST_TIMEOUT_MS);
      });

      const { data, error: insertError } = await Promise.race([
        requestPromise,
        timeoutPromise
      ]);

      if (insertError) {
        setFormError(formatAddEmployeeError(insertError.message));
        return;
      }
      if (!data) {
        setFormError("従業員の追加に失敗しました。");
        return;
      }

      const {
        data: { session: sessionAfter }
      } = await supabase.auth.getSession();

      if (
        sessionBefore?.access_token &&
        sessionBefore?.refresh_token &&
        sessionAfter?.user.id !== sessionBefore.user.id
      ) {
        await supabase.auth.setSession({
          access_token: sessionBefore.access_token,
          refresh_token: sessionBefore.refresh_token
        });
      }

      setEmployees((current) =>
        [...current.filter((item) => item.id !== data.id), data].sort((a, b) =>
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
      if (message.includes("REQUEST_TIMEOUT")) {
        setFormError("追加処理がタイムアウトしました。通信を確認して再試行してください。");
      } else {
        setFormError(formatAddEmployeeError(message));
      }
    } finally {
      setIsAdding(false);
    }
  }, [form]);

  const deleteEmployee = useCallback(async (employee: Profile) => {
    if (!supabase) {
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
  }, []);

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
                従業員ログイン用のメールアドレスと初期パスワードを設定してください。
              </Text>
              {formError ? <ErrorBanner message={formError} /> : null}

              <FormInput
                label="ログインメール (必須)"
                value={form.email}
                onChangeText={(value) => handleChangeForm("email", value)}
                placeholder="例: employee01@example.com"
              />
              <FormInput
                label="初期パスワード (必須)"
                value={form.password}
                onChangeText={(value) => handleChangeForm("password", value)}
                placeholder="8文字以上"
                secureTextEntry
              />
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
