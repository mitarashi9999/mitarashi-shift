import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Header } from "@/components/Header";
import { ErrorBanner } from "@/components/ErrorBanner";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

export function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="設定" subtitle="基本設定を確認できます" />
      {!isSupabaseConfigured ? (
        <ErrorBanner message="Supabase未設定のため、認証系機能は利用できません。" />
      ) : null}
      <View style={styles.card}>
        <Text style={styles.title}>ログイン機能は無効です</Text>
        <Text style={styles.description}>
          このアプリはログインなしで直接利用する設定です。
        </Text>
        <Text style={styles.description}>
          認証を再度有効化する場合は、ナビゲーション設定を戻してください。
        </Text>
        <Text style={styles.meta}>
          Supabase状態: {supabase ? "接続設定あり" : "未設定"}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.xl
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
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.subtext
  },
  meta: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.primary,
    fontWeight: "700"
  }
});
