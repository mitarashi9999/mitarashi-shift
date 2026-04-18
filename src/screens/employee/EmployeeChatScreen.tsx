import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet
} from "react-native";
import { ChatInput } from "@/components/ChatInput";
import { Header } from "@/components/Header";
import { MessageBubble } from "@/components/MessageBubble";
import { useAuthStore } from "@/store/authStore";
import { Message } from "@/types/app";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

const initialMessages: Message[] = [
  {
    id: "1",
    room_id: "direct",
    sender_id: "system-admin",
    content: "明日のシフト開始が30分早まります。",
    created_at: "2026-04-10T20:00:00+09:00",
    read_flag: false
  },
  {
    id: "2",
    room_id: "direct",
    sender_id: "system-employee",
    content: "承知しました。",
    created_at: "2026-04-10T20:05:00+09:00",
    read_flag: true
  }
];

export function EmployeeChatScreen() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const { profile, session } = useAuthStore();

  const myId = useMemo(
    () => profile?.id ?? session?.user.id ?? "current-employee",
    [profile?.id, session?.user.id]
  );

  const handleSend = () => {
    const content = message.trim();
    if (!content) {
      Alert.alert("送信できません", "メッセージを入力してください。");
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        room_id: "direct",
        sender_id: myId,
        content,
        created_at: new Date().toISOString(),
        read_flag: false
      }
    ]);
    setMessage("");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header title="管理者チャット" subtitle="1対1でやり取りできます" />
      <ScrollView contentContainerStyle={styles.messages}>
        {messages.map((item) => (
          <MessageBubble
            key={item.id}
            message={item}
            isMine={item.sender_id === myId}
          />
        ))}
      </ScrollView>
      <ChatInput value={message} onChangeText={setMessage} onSend={handleSend} />
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
