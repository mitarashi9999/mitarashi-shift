import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "@/types/app";

const LOCAL_SESSION_KEY = "shift_local_selected_profile_v1";

type PersistedProfile = {
  id: string;
  role: "admin" | "employee";
  name: string;
  employee_code: string | null;
  phone: string | null;
  department: string | null;
  status: string | null;
};

function sanitizeProfile(input: PersistedProfile): Profile {
  return {
    id: input.id,
    role: input.role,
    name: input.name,
    employee_code: input.employee_code ?? null,
    phone: input.phone ?? null,
    department: input.department ?? null,
    status: input.status ?? "active"
  };
}

function makeLocalEmail(profile: Profile) {
  const seed = profile.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "user";
  return `${seed}@local.shift`;
}

export function createSessionFromProfile(profile: Profile): Session {
  const nowIso = new Date().toISOString();
  const email = makeLocalEmail(profile);
  const tokenSeed = profile.id.replace(/[^a-zA-Z0-9_-]/g, "");

  return {
    access_token: `local-token-${tokenSeed}`,
    refresh_token: `local-refresh-${tokenSeed}`,
    expires_in: 60 * 60 * 24 * 30,
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    user: {
      id: profile.id,
      aud: "authenticated",
      role: "authenticated",
      email,
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
        name: profile.name
      },
      identities: [],
      created_at: nowIso,
      updated_at: nowIso,
      is_anonymous: false
    }
  } as Session;
}

export function createDefaultAdminProfile(): Profile {
  return {
    id: "local-admin-root",
    role: "admin",
    name: "管理者",
    employee_code: null,
    phone: null,
    department: "管理部",
    status: "active"
  };
}

export async function persistLocalProfile(profile: Profile) {
  const payload: PersistedProfile = {
    id: profile.id,
    role: profile.role,
    name: profile.name,
    employee_code: profile.employee_code ?? null,
    phone: profile.phone ?? null,
    department: profile.department ?? null,
    status: profile.status ?? "active"
  };
  await AsyncStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(payload));
}

export async function clearLocalProfile() {
  await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
}

export async function restoreLocalProfileSession() {
  const raw = await AsyncStorage.getItem(LOCAL_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedProfile;
    if (!parsed?.id || !parsed?.name || !parsed?.role) {
      return null;
    }
    const profile = sanitizeProfile(parsed);
    const session = createSessionFromProfile(profile);
    return { profile, session };
  } catch {
    return null;
  }
}

