import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ChatInput } from "@/components/ChatInput";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Header } from "@/components/Header";
import { MessageBubble } from "@/components/MessageBubble";
import {
  appendDirectMessage,
  readDirectMessages,
  removeDirectMessage
} from "@/lib/localChat";
import { useAuthStore } from "@/store/authStore";
import { Message } from "@/types/app";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

const POLL_INTERVAL_MS = 1500;

export function EmployeeChatScreen() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { profile, session } = useAuthStore();

  const myId = useMemo(
    () => profile?.id ?? session?.user.id ?? "current-employee",
    [profile?.id, session?.user.id]
  );

  const loadMessages = useCallback(async () => {
    try {
      const rows = await readDirectMessages();
      setMessages(rows);
      setError(null);
    } catch (cause) {
      const messageText =
        cause instanceof Error ? cause.message : "Unknown chat load error";
      setError(`チャット読み込みに失敗しました: ${messageText}`);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
    const timer = setInterval(() => {
      void loadMessages();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadMessages]);

  useFocusEffect(
    useCallback(() => {
      void loadMessages();
    }, [loadMessages])
  );

  const handleSend = useCallback(async () => {
    const content = message.trim();
    if (!content) {
      Alert.alert("送信できません", "メッセージを入力してください。");
      return;
    }

    try {
      const next = await appendDirectMessage(myId, content);
      setMessages(next);
      setMessage("");
      setError(null);
    } catch (cause) {
      const messageText =
        cause instanceof Error ? cause.message : "Unknown chat send error";
      setError(`送信に失敗しました: ${messageText}`);
    }
  }, [message, myId]);

  const handleDeleteMessage = useCallback(
    async (target: Message) => {
      if (target.sender_id !== myId) {
        return;
      }

      const executeDelete = async () => {
        try {
          const next = await removeDirectMessage(target.id, myId);
          setMessages(next);
          setError(null);
        } catch (cause) {
          const messageText =
            cause instanceof Error ? cause.message : "Unknown chat delete error";
          setError(`削除に失敗しました: ${messageText}`);
        }
      };

      if (Platform.OS === "web") {
        const accepted = window.confirm("このメッセージを削除しますか？");
        if (accepted) {
          await executeDelete();
        }
        return;
      }

      Alert.alert("メッセージ削除", "このメッセージを削除しますか？", [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: () => void executeDelete()
        }
      ]);
    },
    [myId]
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header title="管理者チャット" subtitle="管理者との1対1チャット" />
      {error ? <ErrorBanner message={error} /> : null}
      <ScrollView contentContainerStyle={styles.messages}>
        {messages.map((item) => (
          <MessageBubble
            key={item.id}
            message={item}
            isMine={item.sender_id === myId}
            onDelete={
              item.sender_id === myId
                ? () => void handleDeleteMessage(item)
                : undefined
            }
          />
        ))}
      </ScrollView>
      <ChatInput value={message} onChangeText={setMessage} onSend={() => void handleSend()} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl
  },
  messages: {
    flexGrow: 1,
    gap: spacing.md,
    paddingBottom: spacing.md
  }
});
