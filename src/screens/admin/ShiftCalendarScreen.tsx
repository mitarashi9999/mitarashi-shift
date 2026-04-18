import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, Share, StyleSheet, View } from "react-native";
import type { MarkedDates } from "react-native-calendars/src/types";
import dayjs from "dayjs";
import { CalendarView } from "@/components/CalendarView";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ShiftCard } from "@/components/ShiftCard";
import { supabase } from "@/lib/supabase";
import { Shift } from "@/types/app";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

const MOCK_SHIFTS: Shift[] = [
  {
    id: "sample-1",
    employee_id: "sample-employee-1",
    shift_date: dayjs().format("YYYY-MM-DD"),
    start_time: "09:00",
    end_time: "18:00",
    shift_type: "通常勤務",
    note: "サンプルデータ"
  }
];

type ProfileNameRow = {
  id: string;
  name: string;
};

type ShiftRowPayload = {
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  employee_id: string;
  employee_name: string;
  note: string;
};

const sheetsWebhookUrl = (process.env.EXPO_PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL || "").trim();
const sheetsWebhookToken = (process.env.EXPO_PUBLIC_GOOGLE_SHEETS_WEBHOOK_TOKEN || "").trim();

function escapeCsv(value: string) {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function buildShiftCsv(shifts: Shift[], employeeNames: Record<string, string>) {
  const headers = ["勤務日", "開始", "終了", "勤務区分", "従業員ID", "従業員名", "備考"];
  const lines = shifts.map((shift) => [
    shift.shift_date,
    shift.start_time,
    shift.end_time,
    shift.shift_type,
    shift.employee_id,
    employeeNames[shift.employee_id] ?? "",
    shift.note ?? ""
  ]);
  return `\uFEFF${[headers, ...lines]
    .map((line) => line.map((cell) => escapeCsv(String(cell))).join(","))
    .join("\r\n")}`;
}

async function downloadCsvOnWeb(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function shareCsvOnNative(csv: string, selectedDate: string) {
  await Share.share({
    title: `shift_${selectedDate}.csv`,
    message: csv
  });
}

export function ShiftCalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monthShiftCacheRef = useRef<Record<string, Shift[]>>({});
  const profileNameCacheRef = useRef<Record<string, string>>({});

  const selectedMonth = useMemo(
    () => dayjs(selectedDate).format("YYYY-MM"),
    [selectedDate]
  );

  const loadData = useCallback(async (targetDate: string) => {
    const monthKey = dayjs(targetDate).format("YYYY-MM");
    const cachedShifts = monthShiftCacheRef.current[monthKey];
    if (cachedShifts) {
      setShifts(cachedShifts);
      setError(null);
      return;
    }

    if (!supabase) {
      setShifts(MOCK_SHIFTS);
      setError(null);
      return;
    }

    setError(null);

    try {
      const monthStart = dayjs(targetDate).startOf("month").format("YYYY-MM-DD");
      const monthEnd = dayjs(targetDate).endOf("month").format("YYYY-MM-DD");

      const shiftResult = await supabase
        .from("shifts")
        .select("id, employee_id, shift_date, start_time, end_time, shift_type, note")
        .gte("shift_date", monthStart)
        .lte("shift_date", monthEnd)
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (shiftResult.error) {
        setError(`シフト取得に失敗しました: ${shiftResult.error.message}`);
        setShifts([]);
        return;
      }

      const monthShifts = (shiftResult.data ?? []) as Shift[];
      monthShiftCacheRef.current[monthKey] = monthShifts;
      setShifts(monthShifts);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown load error";
      setError(`シフト取得に失敗しました: ${message}`);
      setShifts([]);
    }
  }, []);

  useEffect(() => {
    void loadData(selectedDate);
  }, [loadData, selectedMonth]);

  const markedDates = useMemo(() => {
    return shifts.reduce((acc, shift) => {
      acc[shift.shift_date] = { marked: true, dotColor: colors.primary };
      return acc;
    }, {} as MarkedDates);
  }, [shifts]);

  const dailyShifts = useMemo(() => {
    return shifts.filter((shift) => shift.shift_date === selectedDate);
  }, [selectedDate, shifts]);

  const ensureEmployeeNames = useCallback(
    async (targetShifts: Shift[]) => {
      if (!supabase) {
        return;
      }

      const missingEmployeeIds = Array.from(
        new Set(
          targetShifts
            .map((shift) => shift.employee_id)
            .filter((id) => id && !profileNameCacheRef.current[id])
        )
      );
      if (!missingEmployeeIds.length) {
        return;
      }

      const profileResult = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", missingEmployeeIds);

      if (!profileResult.error) {
        for (const row of (profileResult.data ?? []) as ProfileNameRow[]) {
          profileNameCacheRef.current[row.id] = row.name;
        }
      }
    },
    []
  );

  const handleExportPress = useCallback(async () => {
    if (!dailyShifts.length) {
      setError("この日付のシフトが無いため、Excelへ反映できません。");
      return;
    }

    await ensureEmployeeNames(dailyShifts);

    const filename = `shift_${selectedDate}.csv`;
    const csv = buildShiftCsv(dailyShifts, profileNameCacheRef.current);
    setIsExporting(true);
    try {
      if (Platform.OS === "web") {
        await downloadCsvOnWeb(filename, csv);
      } else {
        await shareCsvOnNative(csv, selectedDate);
      }
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown export error";
      setError(`Excel出力に失敗しました: ${message}`);
    } finally {
      setIsExporting(false);
    }
  }, [dailyShifts, ensureEmployeeNames, selectedDate]);

  const handleSyncSheetsPress = useCallback(async () => {
    if (!dailyShifts.length) {
      setError("この日付のシフトが無いため、スプレッドシートへ反映できません。");
      return;
    }
    if (!sheetsWebhookUrl) {
      setError("Google連携URLが未設定です。.env に EXPO_PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL を設定してください。");
      return;
    }

    await ensureEmployeeNames(dailyShifts);

    const rows: ShiftRowPayload[] = dailyShifts.map((shift) => ({
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      shift_type: shift.shift_type,
      employee_id: shift.employee_id,
      employee_name: profileNameCacheRef.current[shift.employee_id] ?? "",
      note: shift.note ?? ""
    }));

    setIsSyncingSheets(true);
    try {
      const response = await fetch(sheetsWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: sheetsWebhookToken || null,
          date: selectedDate,
          sent_at: new Date().toISOString(),
          source: "shift-mobile-app",
          rows
        })
      });

      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`${response.status} ${response.statusText} ${bodyText}`.trim());
      }

      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown sync error";
      setError(`スプレッドシート連携に失敗しました: ${message}`);
    } finally {
      setIsSyncingSheets(false);
    }
  }, [dailyShifts, ensureEmployeeNames, selectedDate]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="シフト" subtitle="日付を選択して、Excel/スプレッドシートへ反映できます" />
      <CalendarView
        selectedDate={selectedDate}
        markedDates={markedDates}
        onDayPress={setSelectedDate}
      />
      <PrimaryButton
        label={isExporting ? "出力中..." : "Excelに反映（CSV出力）"}
        onPress={() => void handleExportPress()}
        disabled={isExporting || isSyncingSheets}
      />
      <PrimaryButton
        label={isSyncingSheets ? "反映中..." : "スプレッドシートへ反映"}
        onPress={() => void handleSyncSheetsPress()}
        disabled={isSyncingSheets || isExporting}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <View style={styles.shiftList}>
        {dailyShifts.length ? (
          dailyShifts.map((shift) => <ShiftCard key={shift.id} shift={shift} />)
        ) : (
          <EmptyState
            title="この日のシフトはありません"
            description="シフト作成後に「Excelに反映」を押すと、CSVが出力されます。"
          />
        )}
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
  shiftList: {
    gap: spacing.md
  }
});
