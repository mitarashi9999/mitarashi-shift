import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import dayjs from "dayjs";
import { Message } from "@/types/app";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

type Props = {
  message: Message;
  isMine: boolean;
  onDelete?: () => void;
};

export function MessageBubble({ message, isMine, onDelete }: Props) {
  return (
    <View style={[styles.row, isMine && styles.rowMine]}>
      <View style={[styles.bubble, isMine ? styles.mine : styles.other]}>
        <Text style={[styles.content, isMine && styles.contentMine]}>
          {message.content}
        </Text>
        <Text style={[styles.timestamp, isMine && styles.contentMine]}>
          {dayjs(message.created_at).format("M/D HH:mm")}
        </Text>
        {isMine && onDelete ? (
          <Pressable onPress={onDelete} style={styles.deleteButton}>
            <Text style={styles.deleteText}>削除</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "flex-start"
  },
  rowMine: {
    justifyContent: "flex-end"
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm
  },
  mine: {
    backgroundColor: colors.primary
  },
  other: {
    backgroundColor: colors.surface
  },
  content: {
    fontSize: 15,
    color: colors.text
  },
  contentMine: {
    color: colors.surface
  },
  timestamp: {
    fontSize: 11,
    color: colors.subtext,
    alignSelf: "flex-end"
  },
  deleteButton: {
    alignSelf: "flex-end",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  deleteText: {
    fontSize: 11,
    color: colors.surface,
    fontWeight: "700"
  }
});
