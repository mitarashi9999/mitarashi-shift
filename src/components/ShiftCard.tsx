import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Shift } from "@/types/app";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

type Props = {
  shift: Shift;
  showEmployee?: boolean;
  employeeName?: string | null;
};

export function ShiftCard({ shift, showEmployee = false, employeeName }: Props) {
  const assigneeLabel =
    employeeName && employeeName.trim().length > 0
      ? employeeName.trim()
      : `ID: ${shift.employee_id}`;

  return (
    <View style={styles.card}>
      <Text style={styles.date}>{shift.shift_date}</Text>
      <Text style={styles.time}>
        {shift.start_time} - {shift.end_time}
      </Text>
      {showEmployee ? <Text style={styles.employee}>担当: {assigneeLabel}</Text> : null}
      <Text style={styles.type}>{shift.shift_type}</Text>
      {shift.note ? <Text style={styles.note}>{shift.note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.xs
  },
  date: {
    fontSize: 14,
    color: colors.subtext
  },
  time: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text
  },
  employee: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text
  },
  type: {
    color: colors.primary,
    fontWeight: "700"
  },
  note: {
    fontSize: 14,
    color: colors.subtext
  }
});
