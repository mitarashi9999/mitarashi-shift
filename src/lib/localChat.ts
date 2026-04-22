import AsyncStorage from "@react-native-async-storage/async-storage";
import { Message } from "@/types/app";

const LOCAL_DIRECT_CHAT_KEY = "shift_local_direct_chat_v1";
const DIRECT_ROOM_ID = "direct";

function sortMessages(messages: Message[]) {
  return [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function buildMessageId() {
  return `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function readDirectMessages() {
  const raw = await AsyncStorage.getItem(LOCAL_DIRECT_CHAT_KEY);
  if (!raw) {
    return [] as Message[];
  }
  try {
    const parsed = JSON.parse(raw) as Message[];
    if (!Array.isArray(parsed)) {
      return [] as Message[];
    }
    return sortMessages(
      parsed.filter((item) => item?.room_id === DIRECT_ROOM_ID && !!item.content)
    );
  } catch {
    return [] as Message[];
  }
}

export async function appendDirectMessage(senderId: string, content: string) {
  const current = await readDirectMessages();
  const next: Message[] = [
    ...current,
    {
      id: buildMessageId(),
      room_id: DIRECT_ROOM_ID,
      sender_id: senderId,
      content,
      created_at: new Date().toISOString(),
      read_flag: false
    }
  ];
  const sorted = sortMessages(next);
  await AsyncStorage.setItem(LOCAL_DIRECT_CHAT_KEY, JSON.stringify(sorted));
  return sorted;
}

export async function removeDirectMessage(
  messageId: string,
  senderId?: string
) {
  const current = await readDirectMessages();
  const next = current.filter((item) => {
    if (item.id !== messageId) {
      return true;
    }
    if (!senderId) {
      return false;
    }
    return item.sender_id !== senderId;
  });
  const sorted = sortMessages(next);
  await AsyncStorage.setItem(LOCAL_DIRECT_CHAT_KEY, JSON.stringify(sorted));
  return sorted;
}
