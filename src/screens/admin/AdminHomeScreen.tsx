import React, { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Header } from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

export function AdminHomeScreen() {
  const [todayShiftCount, setTodayShiftCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!supabase) {
      setTodayShiftCount(0);
      setUnreadCount(0);
      setError(null);
      return;
    }

    const today = dayjs().format("YYYY-MM-DD");

    const [shiftResult, unreadResult] = await Promise.all([
      supabase
        .from("shifts")
        .select("id", { head: true, count: "exact" })
        .eq("shift_date", today),
      supabase
        .from("messages")
        .select("id", { head: true, count: "exact" })
        .eq("read_flag", false)
    ]);

    if (shiftResult.error) {
      setError(`ダッシュボード集計に失敗しました: ${shiftResult.error.message}`);
      setTodayShiftCount(0);
    } else {
      setTodayShiftCount(shiftResult.count ?? 0);
      setError(null);
    }

    if (unreadResult.error) {
      setUnreadCount(0);
    } else {
      setUnreadCount(unreadResult.count ?? 0);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header
        title="ダッシュボード"
        subtitle="今日のシフト、未読連絡、従業員の状態をまとめて確認"
      />
      {error ? <ErrorBanner message={error} /> : null}
      <View style={styles.card}>
        <Text style={styles.value}>{todayShiftCount}</Text>
        <Text style={styles.label}>本日のシフト件数</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.value}>{unreadCount}</Text>
        <Text style={styles.label}>未読メッセージ</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.lg
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
    gap: spacing.xs
  },
  value: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.text
  },
  label: {
    color: colors.subtext,
    fontSize: 14
  }
});
