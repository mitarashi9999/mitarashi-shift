import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Profile } from "@/types/app";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

type Props = {
  employee: Profile;
  onPress?: () => void;
};

export function EmployeeCard({ employee, onPress }: Props) {
  const content = (
    <View style={styles.card}>
      <Text style={styles.name}>{employee.name}</Text>
      <Text style={styles.meta}>{employee.department || "未設定"}</Text>
      <Text style={styles.meta}>
        社員コード: {employee.employee_code || "未設定"}
      </Text>
      <Text style={styles.status}>{employee.status || "active"}</Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.xs
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text
  },
  meta: {
    fontSize: 14,
    color: colors.subtext
  },
  status: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    color: colors.primary,
    fontWeight: "700"
  },
  pressed: {
    opacity: 0.75
  }
});
