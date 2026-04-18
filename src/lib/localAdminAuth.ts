import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "@/types/app";

const LOCAL_ADMIN_SESSION_KEY = "shift_local_admin_session_v1";

const configuredAdminEmail = (process.env.EXPO_PUBLIC_ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();
const configuredAdminPassword = (process.env.EXPO_PUBLIC_ADMIN_PASSWORD || "").trim();

type LocalAdminSession = {
  email: string;
  loggedInAt: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildLocalAdminId(email: string) {
  const normalized = normalizeEmail(email).replace(/[^a-z0-9]/g, "_");
  return `local-admin-${normalized || "default"}`;
}

export function isLocalAdminConfigured() {
  return Boolean(configuredAdminEmail && configuredAdminPassword);
}

export function validateLocalAdminCredentials(email: string, password: string) {
  if (!isLocalAdminConfigured()) {
    return false;
  }
  return (
    normalizeEmail(email) === configuredAdminEmail &&
    password.trim() === configuredAdminPassword
  );
}

export function createLocalAdminProfile(email: string): Profile {
  const normalizedEmail = normalizeEmail(email);
  return {
    id: buildLocalAdminId(normalizedEmail),
    role: "admin",
    name: normalizedEmail.split("@")[0] || "管理者",
    employee_code: null,
    phone: null,
    department: "管理部",
    status: "active"
  };
}

export function createLocalAdminSession(email: string): Session {
  const nowIso = new Date().toISOString();
  const normalizedEmail = normalizeEmail(email);

  return {
    access_token: `local-admin-token-${buildLocalAdminId(normalizedEmail)}`,
    refresh_token: `local-admin-refresh-${buildLocalAdminId(normalizedEmail)}`,
    expires_in: 60 * 60 * 24 * 30,
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    user: {
      id: buildLocalAdminId(normalizedEmail),
      aud: "authenticated",
      role: "authenticated",
      email: normalizedEmail,
      email_confirmed_at: nowIso,
      phone: "",
      confirmation_sent_at: nowIso,
      confirmed_at: nowIso,
      last_sign_in_at: nowIso,
      app_metadata: {
        provider: "email",
        providers: ["email"]
      },
      user_metadata: {
        name: "管理者"
      },
      identities: [],
      created_at: nowIso,
      updated_at: nowIso,
      is_anonymous: false
    }
  } as Session;
}

export async function persistLocalAdminSession(email: string) {
  const payload: LocalAdminSession = {
    email: normalizeEmail(email),
    loggedInAt: new Date().toISOString()
  };
  await AsyncStorage.setItem(LOCAL_ADMIN_SESSION_KEY, JSON.stringify(payload));
}

export async function clearLocalAdminSession() {
  await AsyncStorage.removeItem(LOCAL_ADMIN_SESSION_KEY);
}

export async function restoreLocalAdminSession() {
  if (!isLocalAdminConfigured()) {
    return null;
  }

  const raw = await AsyncStorage.getItem(LOCAL_ADMIN_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as LocalAdminSession;
    if (!payload?.email) {
      return null;
    }

    if (normalizeEmail(payload.email) !== configuredAdminEmail) {
      return null;
    }

    return {
      session: createLocalAdminSession(payload.email),
      profile: createLocalAdminProfile(payload.email)
    };
  } catch {
    return null;
  }
}

