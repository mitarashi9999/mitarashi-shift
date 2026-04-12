import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { Header } from "@/components/Header";
import { FormInput } from "@/components/FormInput";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigStatus
} from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

function getConfigErrorMessage() {
  switch (supabaseConfigStatus.code) {
    case "ENV_URL_MISSING":
      return "[ENV_URL_MISSING] EXPO_PUBLIC_SUPABASE_URL is missing.";
    case "ENV_KEY_MISSING":
      return "[ENV_KEY_MISSING] EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.";
    case "ENV_KEY_PLACEHOLDER":
      return "[ENV_KEY_PLACEHOLDER] Replace the placeholder key in .env.";
    case "ENV_KEY_INVALID_FORMAT":
      return "[ENV_KEY_INVALID_FORMAT] Use sb_publishable_... key.";
    default:
      return "";
  }
}

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { authError } = useAuthStore();
  const configErrorMessage = useMemo(() => getConfigErrorMessage(), []);

  const handleLogin = async () => {
    if (!supabase) {
      setError(`${configErrorMessage} Restart dev server after .env update.`);
      return;
    }

    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      setError(signInError.message);
    }

    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Header
          title="ログイン"
          subtitle="管理者・従業員どちらも同じ画面からログインできます"
        />
        <View style={styles.form}>
          {!isSupabaseConfigured ? (
            <ErrorBanner
              message={`${configErrorMessage} Restart required: npm run dev`}
            />
          ) : null}
          {!isSupabaseConfigured ? (
            <ErrorBanner
              message={`diagnostic: code=${supabaseConfigStatus.code}, url=${supabaseConfigStatus.hasUrl ? "set" : "empty"}, key=${supabaseConfigStatus.keyPreview}`}
            />
          ) : null}
          {authError ? <ErrorBanner message={`auth: ${authError}`} /> : null}
          <FormInput
            label="メールアドレス"
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
          />
          <FormInput
            label="パスワード"
            value={password}
            onChangeText={setPassword}
            placeholder="********"
            secureTextEntry
          />
          {error ? <ErrorBanner message={error} /> : null}
          <PrimaryButton
            label={loading ? "ログイン中..." : "ログイン"}
            onPress={handleLogin}
            disabled={loading || !email || !password || !isSupabaseConfigured}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.xl
  },
  form: {
    gap: spacing.lg
  }
});
