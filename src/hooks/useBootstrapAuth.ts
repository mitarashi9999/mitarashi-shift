import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";

const BOOTSTRAP_TIMEOUT_MS = 7000;

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

    const finishBootstrapping = () => {
      if (!mounted || finished) {
        return;
      }
      finished = true;
      setBootstrapping(false);
    };

    const timeoutId = setTimeout(() => {
      setAuthError("[BOOTSTRAP_TIMEOUT]");
      finishBootstrapping();
    }, BOOTSTRAP_TIMEOUT_MS);

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

        const { data, error } = await client
          .from("profiles")
          .select("id, role, name, employee_code, phone, department, status")
          .eq("id", session.user.id)
          .maybeSingle();

        if (!mounted) {
          return;
        }

        setProfile(data ?? null);
        if (error) {
          setAuthError(`[PROFILE_FETCH_ERROR] ${error.code ?? error.message}`);
        } else if (!data) {
          setAuthError("[PROFILE_NOT_FOUND]");
        } else {
          setAuthError(null);
        }
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

        const { data, error } = await client
          .from("profiles")
          .select("id, role, name, employee_code, phone, department, status")
          .eq("id", session.user.id)
          .maybeSingle();

        setProfile(data ?? null);
        if (error) {
          setAuthError(`[PROFILE_FETCH_ERROR] ${error.code ?? error.message}`);
        } else if (!data) {
          setAuthError("[PROFILE_NOT_FOUND]");
        } else {
          setAuthError(null);
        }

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
