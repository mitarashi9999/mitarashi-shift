import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from "react-native";
import type { MarkedDates } from "react-native-calendars/src/types";
import dayjs from "dayjs";
import { CalendarView } from "@/components/CalendarView";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FormInput } from "@/components/FormInput";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ShiftCard } from "@/components/ShiftCard";
import { supabase } from "@/lib/supabase";
import { Profile, Shift } from "@/types/app";
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
const sheetsProxyUrl = (process.env.EXPO_PUBLIC_SHEETS_PROXY_URL || "/api/sheets-sync").trim();
const LOCAL_SHIFTS_KEY = "shift_local_shifts_v1";
const LOCAL_EMPLOYEES_KEY = "shift_local_employees_v1";

type ShiftForm = {
  employeeId: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  note: string;
};

const EMPTY_SHIFT_FORM: ShiftForm = {
  employeeId: "",
  startTime: "09:00",
  endTime: "18:00",
  shiftType: "通常勤務",
  note: ""
};

function isShiftsTableMissing(message: string) {
  return (
    message.includes("Could not find the table 'public.shifts'") ||
    message.includes("relation \"public.shifts\" does not exist") ||
    message.includes("public.shifts")
  );
}

function isShiftInsertDenied(message: string) {
  return (
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("not allowed") ||
    message.includes("new row violates")
  );
}

function createUuidV4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function sortShifts(list: Shift[]) {
  return [...list].sort((a, b) => {
    const dateCompare = a.shift_date.localeCompare(b.shift_date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.start_time.localeCompare(b.start_time);
  });
}

function filterMonthShifts(shifts: Shift[], targetDate: string) {
  const monthKey = dayjs(targetDate).format("YYYY-MM");
  return shifts.filter((shift) => shift.shift_date.startsWith(monthKey));
}

async function readLocalShifts() {
  const raw = await AsyncStorage.getItem(LOCAL_SHIFTS_KEY);
  if (!raw) {
    return [] as Shift[];
  }
  try {
    const parsed = JSON.parse(raw) as Shift[];
    if (!Array.isArray(parsed)) {
      return [] as Shift[];
    }
    return parsed;
  } catch {
    return [] as Shift[];
  }
}

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

async function writeLocalShifts(shifts: Shift[]) {
  await AsyncStorage.setItem(LOCAL_SHIFTS_KEY, JSON.stringify(sortShifts(shifts)));
}

async function readLocalEmployees() {
  const raw = await AsyncStorage.getItem(LOCAL_EMPLOYEES_KEY);
  if (!raw) {
    return [] as Pick<Profile, "id" | "name">[];
  }
  try {
    const parsed = JSON.parse(raw) as Profile[];
    if (!Array.isArray(parsed)) {
      return [] as Pick<Profile, "id" | "name">[];
    }
    return parsed
      .filter((row) => row?.role === "employee")
      .map((row) => ({ id: row.id, name: row.name }));
  } catch {
    return [] as Pick<Profile, "id" | "name">[];
  }
}

export function ShiftCalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [isSavingShift, setIsSavingShift] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [employees, setEmployees] = useState<ProfileNameRow[]>([]);
  const [shiftForm, setShiftForm] = useState<ShiftForm>(EMPTY_SHIFT_FORM);
  const monthShiftCacheRef = useRef<Record<string, Shift[]>>({});
  const profileNameCacheRef = useRef<Record<string, string>>({});

  const selectedMonth = useMemo(
    () => dayjs(selectedDate).format("YYYY-MM"),
    [selectedDate]
  );

  const loadEmployeeOptions = useCallback(async () => {
    if (!supabase || isLocalMode) {
      const localEmployees = await readLocalEmployees();
      setEmployees(localEmployees);
      localEmployees.forEach((row) => {
        profileNameCacheRef.current[row.id] = row.name;
      });
      setShiftForm((current) =>
        current.employeeId
          ? current
          : { ...current, employeeId: localEmployees[0]?.id ?? "" }
      );
      return;
    }

    const profileResult = await supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "employee")
      .order("name", { ascending: true });

    if (profileResult.error) {
      if (profileResult.error.message.includes("public.profiles")) {
        const localEmployees = await readLocalEmployees();
        setEmployees(localEmployees);
        localEmployees.forEach((row) => {
          profileNameCacheRef.current[row.id] = row.name;
        });
        setShiftForm((current) =>
          current.employeeId
            ? current
            : { ...current, employeeId: localEmployees[0]?.id ?? "" }
        );
      }
      return;
    }

    const rows = (profileResult.data ?? []) as ProfileNameRow[];
    setEmployees(rows);
    rows.forEach((row) => {
      profileNameCacheRef.current[row.id] = row.name;
    });
    setShiftForm((current) =>
      current.employeeId ? current : { ...current, employeeId: rows[0]?.id ?? "" }
    );
  }, [isLocalMode]);

  const loadData = useCallback(async (targetDate: string) => {
    const monthKey = dayjs(targetDate).format("YYYY-MM");
    const cachedShifts = monthShiftCacheRef.current[monthKey];
    if (cachedShifts) {
      setShifts(cachedShifts);
      setError(null);
      return;
    }

    if (!supabase || isLocalMode) {
      const localShifts = await readLocalShifts();
      const monthLocalShifts = filterMonthShifts(localShifts, targetDate);
      setShifts(monthLocalShifts.length ? monthLocalShifts : MOCK_SHIFTS);
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
        if (isShiftsTableMissing(shiftResult.error.message)) {
          const localShifts = await readLocalShifts();
          const monthLocalShifts = filterMonthShifts(localShifts, targetDate);
          monthShiftCacheRef.current[monthKey] = monthLocalShifts.length
            ? monthLocalShifts
            : MOCK_SHIFTS;
          setShifts(monthShiftCacheRef.current[monthKey]);
          setError(null);
          setIsLocalMode(true);
          return;
        }
        setError(`シフト取得に失敗しました: ${shiftResult.error.message}`);
        setShifts([]);
        return;
      }

      const monthShifts = (shiftResult.data ?? []) as Shift[];
      monthShiftCacheRef.current[monthKey] = monthShifts;
      setShifts(monthShifts);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown load error";
      if (isShiftsTableMissing(message)) {
        const localShifts = await readLocalShifts();
        const monthLocalShifts = filterMonthShifts(localShifts, targetDate);
        monthShiftCacheRef.current[monthKey] = monthLocalShifts.length
          ? monthLocalShifts
          : MOCK_SHIFTS;
        setShifts(monthShiftCacheRef.current[monthKey]);
        setError(null);
        setIsLocalMode(true);
        return;
      }
      setError(`シフト取得に失敗しました: ${message}`);
      setShifts([]);
    }
  }, [isLocalMode]);

  useEffect(() => {
    void loadData(selectedDate);
  }, [loadData, selectedMonth]);

  useEffect(() => {
    void loadEmployeeOptions();
  }, [loadEmployeeOptions]);

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

      for (const id of missingEmployeeIds) {
        const localName = employees.find((employee) => employee.id === id)?.name;
        if (localName) {
          profileNameCacheRef.current[id] = localName;
        }
      }

      const stillMissing = missingEmployeeIds.filter(
        (id) => !profileNameCacheRef.current[id]
      );
      if (!stillMissing.length || !supabase || isLocalMode) {
        return;
      }

      const profileResult = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", stillMissing);

      if (!profileResult.error) {
        for (const row of (profileResult.data ?? []) as ProfileNameRow[]) {
          profileNameCacheRef.current[row.id] = row.name;
        }
      }
    },
    [employees, isLocalMode]
  );

  const openAddModal = useCallback(() => {
    if (!employees.length) {
      setError("先に従業員を追加してください。");
      return;
    }
    setError(null);
    setFormError(null);
    setShiftForm((current) => ({
      ...current,
      employeeId: current.employeeId || employees[0].id
    }));
    setAddModalVisible(true);
  }, [employees]);

  const closeAddModal = useCallback(() => {
    if (isSavingShift) {
      return;
    }
    setAddModalVisible(false);
  }, [isSavingShift]);

  const updateShiftForm = useCallback((key: keyof ShiftForm, value: string) => {
    setShiftForm((current) => ({ ...current, [key]: value }));
  }, []);

  const applySavedShiftToState = useCallback(
    (savedShift: Shift) => {
      const monthKey = dayjs(savedShift.shift_date).format("YYYY-MM");
      const currentMonthShifts = monthShiftCacheRef.current[monthKey] ?? shifts;
      const nextMonthShifts = sortShifts([
        ...currentMonthShifts
          .filter((item) => item.id !== savedShift.id)
          .filter((item) => !item.id.startsWith("sample-")),
        savedShift
      ]);
      monthShiftCacheRef.current[monthKey] = nextMonthShifts;

      if (monthKey === selectedMonth) {
        setShifts(nextMonthShifts);
      }
    },
    [selectedMonth, shifts]
  );

  const persistShiftLocally = useCallback(
    async (shift: Shift) => {
      const localShifts = await readLocalShifts();
      const nextLocalShifts = sortShifts([
        ...localShifts.filter((item) => item.id !== shift.id),
        shift
      ]);
      await writeLocalShifts(nextLocalShifts);
      applySavedShiftToState(shift);
    },
    [applySavedShiftToState]
  );

  const handleCreateShift = useCallback(async () => {
    const employeeId = shiftForm.employeeId.trim() || employees[0]?.id || "";
    const startTime = shiftForm.startTime.trim();
    const endTime = shiftForm.endTime.trim();
    const shiftType = shiftForm.shiftType.trim() || "通常勤務";
    const note = shiftForm.note.trim();

    if (!employeeId) {
      setFormError("従業員を選択してください。");
      return;
    }
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      setFormError("開始・終了時刻は HH:mm 形式で入力してください（例: 09:00）。");
      return;
    }
    if (startTime >= endTime) {
      setFormError("終了時刻は開始時刻より後にしてください。");
      return;
    }

    const hasOverlap = shifts.some(
      (item) =>
        item.employee_id === employeeId &&
        item.shift_date === selectedDate &&
        startTime < item.end_time &&
        endTime > item.start_time
    );
    if (hasOverlap) {
      setFormError("同じ従業員のシフト時間が重複しています。");
      return;
    }

    const localShift: Shift = {
      id: `local-shift-${createUuidV4()}`,
      employee_id: employeeId,
      shift_date: selectedDate,
      start_time: startTime,
      end_time: endTime,
      shift_type: shiftType,
      note: note || null
    };

    setIsSavingShift(true);
    setFormError(null);

    try {
      if (!supabase || isLocalMode) {
        await persistShiftLocally(localShift);
        setIsLocalMode(true);
        setAddModalVisible(false);
        setShiftForm((current) => ({ ...EMPTY_SHIFT_FORM, employeeId: current.employeeId }));
        return;
      }

      const { data, error: insertError } = await supabase
        .from("shifts")
        .insert({
          employee_id: employeeId,
          shift_date: selectedDate,
          start_time: startTime,
          end_time: endTime,
          shift_type: shiftType,
          note: note || null,
          created_by: employeeId
        })
        .select("id, employee_id, shift_date, start_time, end_time, shift_type, note")
        .single();

      if (insertError) {
        if (
          isShiftsTableMissing(insertError.message) ||
          isShiftInsertDenied(insertError.message)
        ) {
          await persistShiftLocally(localShift);
          setIsLocalMode(true);
          setAddModalVisible(false);
          setShiftForm((current) => ({
            ...EMPTY_SHIFT_FORM,
            employeeId: current.employeeId
          }));
          return;
        }
        if (insertError.message.includes("Shift overlaps")) {
          setFormError("同じ従業員のシフト時間が重複しています。");
          return;
        }
        setFormError(`シフト作成に失敗しました: ${insertError.message}`);
        return;
      }

      const savedShift = (data ?? null) as Shift | null;
      if (!savedShift) {
        setFormError("シフト作成に失敗しました。");
        return;
      }

      applySavedShiftToState(savedShift);
      setError(null);
      setAddModalVisible(false);
      setShiftForm((current) => ({ ...EMPTY_SHIFT_FORM, employeeId: current.employeeId }));
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unknown shift create error";
      setFormError(`シフト作成に失敗しました: ${message}`);
    } finally {
      setIsSavingShift(false);
    }
  }, [
    applySavedShiftToState,
    employees,
    isLocalMode,
    persistShiftLocally,
    selectedDate,
    shiftForm,
    shifts
  ]);

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
    const useProxy = Platform.OS === "web";
    if (!useProxy && !sheetsWebhookUrl) {
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
      const endpoint = useProxy ? sheetsProxyUrl : sheetsWebhookUrl;
      const response = await fetch(endpoint, {
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

      const bodyText = await response.text();
      let bodyJson: unknown = null;
      try {
        bodyJson = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        bodyJson = null;
      }

      if (!response.ok) {
        if (bodyJson && typeof bodyJson === "object" && "hint" in bodyJson) {
          throw new Error(
            `${response.status} ${response.statusText} ${(bodyJson as { hint?: string }).hint ?? ""}`.trim()
          );
        }
        throw new Error(
          `${response.status} ${response.statusText} ${bodyText}`.trim()
        );
      }

      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown sync error";
      const extraHint =
        Platform.OS === "web"
          ? "（Vercelの環境変数 GOOGLE_SHEETS_WEBHOOK_URL / GOOGLE_SHEETS_WEBHOOK_TOKEN を確認してください）"
          : "";
      setError(`スプレッドシート連携に失敗しました: ${message}${extraHint}`);
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
        label="この日にシフトを追加"
        onPress={openAddModal}
        disabled={isExporting || isSyncingSheets}
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

      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeAddModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>シフトを追加</Text>
              <Text style={styles.modalHint}>
                {selectedDate} のシフトを登録します。
              </Text>
              {formError ? <ErrorBanner message={formError} /> : null}

              <View style={styles.employeeSection}>
                <Text style={styles.employeeTitle}>従業員を選択</Text>
                <View style={styles.employeeChipWrap}>
                  {employees.map((employee) => {
                    const selected = shiftForm.employeeId === employee.id;
                    return (
                      <Pressable
                        key={employee.id}
                        onPress={() => updateShiftForm("employeeId", employee.id)}
                        style={[styles.employeeChip, selected && styles.employeeChipSelected]}
                      >
                        <Text
                          style={[
                            styles.employeeChipText,
                            selected && styles.employeeChipTextSelected
                          ]}
                        >
                          {employee.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <FormInput
                label="開始時刻 (HH:mm)"
                value={shiftForm.startTime}
                onChangeText={(value) => updateShiftForm("startTime", value)}
                placeholder="例: 09:00"
              />
              <FormInput
                label="終了時刻 (HH:mm)"
                value={shiftForm.endTime}
                onChangeText={(value) => updateShiftForm("endTime", value)}
                placeholder="例: 18:00"
              />
              <FormInput
                label="勤務区分"
                value={shiftForm.shiftType}
                onChangeText={(value) => updateShiftForm("shiftType", value)}
                placeholder="例: 通常勤務"
              />
              <FormInput
                label="備考"
                value={shiftForm.note}
                onChangeText={(value) => updateShiftForm("note", value)}
                placeholder="任意"
              />

              <View style={styles.modalActions}>
                <PrimaryButton
                  label="キャンセル"
                  onPress={closeAddModal}
                  variant="secondary"
                  disabled={isSavingShift}
                />
                <PrimaryButton
                  label={isSavingShift ? "保存中..." : "シフトを保存"}
                  onPress={() => void handleCreateShift()}
                  disabled={isSavingShift}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingBottom: spacing.xxl
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
  employeeSection: {
    gap: spacing.sm
  },
  employeeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  employeeChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  employeeChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999
  },
  employeeChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  employeeChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  },
  employeeChipTextSelected: {
    color: colors.primary
  },
  modalActions: {
    gap: spacing.sm,
    marginTop: spacing.sm
  }
});
