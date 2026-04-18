import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";

const BOOTSTRAP_TIMEOUT_MS = 12000;
const PROFILE_COLUMNS =
  "id, role, name, employee_code, phone, department, status";

function buildProvisionalAdminProfile(user: User) {
  return {
    id: user.id,
    role: "admin" as const,
    name: guessDisplayName(user),
    employee_code: null,
    phone: null,
    department: null,
    status: "provisional"
  };
}

function guessDisplayName(user: User) {
  const metadataName = typeof user.user_metadata?.name === "string"
    ? user.user_metadata.name.trim()
    : "";
  if (metadataName) {
    return metadataName;
  }
  const emailLocalPart = user.email?.split("@")[0]?.trim();
  if (emailLocalPart) {
    return emailLocalPart;
  }
  return "ユーザー";
}

export function useBootstrapAuth() {
  const { setSession, setProfile, setBootstrapping, setAuthError } = useAuthStore();

  useEffect(() => {
    const client = supabase;

    if (!client) {
      setSession(null);
      setProfile(null);
      setAuthError("[SUPABASE_NOT_CONFIGURED]");
      setBootstrapping(false);
      return;
    }

    let mounted = true;
    let finished = false;
    let pendingUser: User | null = null;

    const finishBootstrapping = () => {
      if (!mounted || finished) {
        return;
      }
      finished = true;
      setBootstrapping(false);
    };

    const timeoutId = setTimeout(() => {
      if (pendingUser) {
        setProfile({
          id: pendingUser.id,
          role: "admin",
          name: guessDisplayName(pendingUser),
          employee_code: null,
          phone: null,
          department: null,
          status: "provisional"
        });
        setAuthError("[BOOTSTRAP_TIMEOUT_FALLBACK_PROFILE]");
      } else {
        setAuthError("[BOOTSTRAP_TIMEOUT]");
      }
      finishBootstrapping();
    }, BOOTSTRAP_TIMEOUT_MS);

    const fetchOrCreateProfile = async (user: User) => {
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        return { profile: null, error: `[PROFILE_FETCH_ERROR] ${profileError.code ?? profileError.message}` };
      }
      if (profile) {
        return { profile, error: null };
      }

      const { data: inserted, error: insertError } = await client
        .from("profiles")
        .upsert({
          id: user.id,
          role: "admin",
          name: guessDisplayName(user),
          status: "active"
        }, { onConflict: "id" })
        .select(PROFILE_COLUMNS)
        .maybeSingle();

      if (insertError) {
        return {
          profile: buildProvisionalAdminProfile(user),
          error: `[PROFILE_CREATE_FALLBACK_ADMIN] ${insertError.code ?? insertError.message}`
        };
      }
      if (inserted) {
        return { profile: inserted, error: null };
      }
      return {
        profile: buildProvisionalAdminProfile(user),
        error: "[PROFILE_NOT_FOUND_FALLBACK_ADMIN]"
      };
    };

    const load = async () => {
      try {
        const {
          data: { session },
          error: sessionError
        } = await client.auth.getSession();

        if (!mounted) {
          return;
        }

        if (sessionError) {
          setSession(null);
          setProfile(null);
          setAuthError(`[SESSION_FETCH_ERROR] ${sessionError.message}`);
          return;
        }

        setSession(session);

        if (!session?.user) {
          setProfile(null);
          setAuthError(null);
          return;
        }

        pendingUser = session.user;
        const result = await fetchOrCreateProfile(session.user);
        if (!mounted) {
          return;
        }
        if (finished) {
          return;
        }

        setProfile(result.profile);
        setAuthError(result.error);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown bootstrap exception";
        setAuthError(`[BOOTSTRAP_EXCEPTION] ${message}`);
      } finally {
        clearTimeout(timeoutId);
        finishBootstrapping();
      }
    };

    load();

    const { data: authListener } = client.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);

        if (!session?.user) {
          setProfile(null);
          setAuthError(null);
          finishBootstrapping();
          return;
        }

        pendingUser = session.user;
        const result = await fetchOrCreateProfile(session.user);
        if (finished) {
          return;
        }
        setProfile(result.profile);
        setAuthError(result.error);
        finishBootstrapping();
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      authListener.subscription.unsubscribe();
    };
  }, [setAuthError, setBootstrapping, setProfile, setSession]);
}
