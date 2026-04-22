import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const appReadToken = (process.env.EXPO_PUBLIC_APP_READ_TOKEN || "").trim();
const appWriteToken = (process.env.EXPO_PUBLIC_APP_WRITE_TOKEN || "").trim();
const isPlaceholderKey =
  /PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE/i.test(supabaseAnonKey) ||
  /PASTE_/i.test(supabaseAnonKey);
const isPublishableKeyFormat = /^sb_publishable_[^\s]+$/.test(supabaseAnonKey);

export type SupabaseConfigErrorCode =
  | "OK"
  | "ENV_URL_MISSING"
  | "ENV_KEY_MISSING"
  | "ENV_KEY_PLACEHOLDER"
  | "ENV_KEY_INVALID_FORMAT";

const getSupabaseConfigCode = (): SupabaseConfigErrorCode => {
  if (!supabaseUrl) {
    return "ENV_URL_MISSING";
  }
  if (!supabaseAnonKey) {
    return "ENV_KEY_MISSING";
  }
  if (isPlaceholderKey) {
    return "ENV_KEY_PLACEHOLDER";
  }
  if (!isPublishableKeyFormat) {
    return "ENV_KEY_INVALID_FORMAT";
  }
  return "OK";
};

export const supabaseConfigStatus = {
  code: getSupabaseConfigCode(),
  hasUrl: Boolean(supabaseUrl),
  hasAnonKey: Boolean(supabaseAnonKey),
  keyPreview: supabaseAnonKey ? `${supabaseAnonKey.slice(0, 20)}...` : "(empty)"
};

export const isSupabaseConfigured = supabaseConfigStatus.code === "OK";

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          ...(appReadToken ? { "x-app-token": appReadToken } : {}),
          ...(appWriteToken ? { "x-app-write-token": appWriteToken } : {})
        }
      },
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    })
  : null;
