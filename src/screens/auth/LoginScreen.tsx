import React, { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Header } from "@/components/Header";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { PrimaryButton } from "@/components/PrimaryButton";
import {
  createDefaultAdminProfile,
  createSessionFromProfile,
  persistLocalProfile
} from "@/lib/localSessionAuth";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { Profile } from "@/types/app";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

const LOCAL_EMPLOYEES_KEY = "shift_local_employees_v1";
const PROFILE_COLUMNS =
  "id, role, name, employee_code, phone, department, status";

function isProfilesTableMissing(message: string) {
  return (
    message.includes("Could not find the table 'public.profiles'") ||
    message.includes("relation \"public.profiles\" does not exist") ||
    message.includes("public.profiles")
  );
}

function normalizeEmployeeProfiles(list: Profile[]) {
  return list.filter((item) => item.role === "employee");
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
    return normalizeEmployeeProfiles(parsed);
  } catch {
    return [] as Profile[];
  }
}

function mergeEmployees(remoteEmployees: Profile[], localEmployees: Profile[]) {
  const map = new Map<string, Profile>();
  localEmployees.forEach((row) => map.set(row.id, row));
  remoteEmployees.forEach((row) => map.set(row.id, row));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function LoginScreen() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setSession, setProfile, setAuthError } = useAuthStore();

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    const localEmployees = await readLocalEmployees();

    if (!supabase) {
      setEmployees(localEmployees);
      setLoading(false);
      return;
    }

    const profileResult = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("role", "employee")
      .order("name", { ascending: true });

    if (profileResult.error) {
      if (!isProfilesTableMissing(profileResult.error.message)) {
        setError(`従業員一覧の取得に失敗しました: ${profileResult.error.message}`);
      }
      setEmployees(localEmployees);
      setLoading(false);
      return;
    }

    const remoteEmployees = normalizeEmployeeProfiles(
      (profileResult.data ?? []) as Profile[]
    );
    setEmployees(mergeEmployees(remoteEmployees, localEmployees));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const loginWithProfile = useCallback(
    async (targetProfile: Profile, authTag: string) => {
      await persistLocalProfile(targetProfile);
      setSession(createSessionFromProfile(targetProfile));
      setProfile(targetProfile);
      setAuthError(authTag);
    },
    [setAuthError, setProfile, setSession]
  );

  const handleAdminLogin = useCallback(async () => {
    await loginWithProfile(createDefaultAdminProfile(), "[LOCAL_ADMIN_PICK]");
  }, [loginWithProfile]);

  const handleEmployeeLogin = useCallback(
    async (employee: Profile) => {
      await loginWithProfile(employee, "[LOCAL_EMPLOYEE_PICK]");
    },
    [loginWithProfile]
  );

  if (loading) {
    return <LoadingOverlay message="従業員一覧を準備しています..." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header
        title="ログイン"
        subtitle="従業員は一覧から選択するだけでログインできます"
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>管理者</Text>
        <PrimaryButton label="管理者で入る" onPress={() => void handleAdminLogin()} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>従業員</Text>
        {error ? <ErrorBanner message={error} /> : null}
        {employees.length ? (
          <View style={styles.employeeList}>
            {employees.map((employee) => (
              <Pressable
                key={employee.id}
                onPress={() => void handleEmployeeLogin(employee)}
                style={({ pressed }) => [
                  styles.employeeCard,
                  pressed && styles.employeeCardPressed
                ]}
              >
                <Text style={styles.employeeName}>{employee.name}</Text>
                <Text style={styles.employeeMeta}>
                  社員コード: {employee.employee_code || "未設定"}
                </Text>
                <Text style={styles.employeeMeta}>
                  部署: {employee.department || "未設定"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState
            title="従業員がまだいません"
            description="管理者画面で従業員を追加すると、ここに表示されます。"
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.xl
  },
  section: {
    gap: spacing.md
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text
  },
  employeeList: {
    gap: spacing.sm
  },
  employeeCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.xs
  },
  employeeCardPressed: {
    opacity: 0.8
  },
  employeeName: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text
  },
  employeeMeta: {
    fontSize: 13,
    color: colors.subtext
  }
});

