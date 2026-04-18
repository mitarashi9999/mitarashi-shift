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
    room_id: "global",
    sender_id: "system-admin",
    content: "本日は10時開店です。準備をお願いします。",
    created_at: "2026-04-10T08:00:00+09:00",
    read_flag: true
  },
  {
    id: "2",
    room_id: "global",
    sender_id: "system-employee",
    content: "了解しました。",
    created_at: "2026-04-10T08:05:00+09:00",
    read_flag: true
  }
];

export function AdminChatScreen() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const { profile, session } = useAuthStore();

  const myId = useMemo(
    () => profile?.id ?? session?.user.id ?? "current-admin",
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
        room_id: "global",
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
      <Header title="チャット" subtitle="全体連絡と個人チャットを確認できます" />
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
