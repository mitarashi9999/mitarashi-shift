import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { clearLocalProfile } from "@/lib/localSessionAuth";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

export function SettingsScreen() {
  const { profile, setSession, setProfile, setAuthError } = useAuthStore();

  const handleLogout = async () => {
    await clearLocalProfile();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setProfile(null);
    setAuthError(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="設定" subtitle="現在のログイン情報を確認できます" />
      <View style={styles.card}>
        <Text style={styles.title}>ログイン中</Text>
        <Text style={styles.detail}>名前: {profile?.name ?? "-"}</Text>
        <Text style={styles.detail}>
          役割: {profile?.role === "admin" ? "管理者" : "従業員"}
        </Text>
        <Text style={styles.detail}>
          社員コード: {profile?.employee_code || "未設定"}
        </Text>
      </View>
      <PrimaryButton label="ログアウト" onPress={() => void handleLogout()} variant="danger" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.lg
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.sm
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text
  },
  detail: {
    fontSize: 14,
    color: colors.subtext
  }
});

