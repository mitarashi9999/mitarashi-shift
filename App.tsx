import "react-native-gesture-handler";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppNavigator } from "@/navigation/AppNavigator";
import { colors } from "@/theme/colors";

const queryClient = new QueryClient();

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message ?? "Unknown runtime error"
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>画面の描画に失敗しました</Text>
          <Text style={styles.errorMessage}>
            {this.state.message}
          </Text>
          <Text style={styles.errorHint}>
            ブラウザの開発者ツール Console のエラー内容を共有してください。
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const rootStyle =
    Platform.OS === "web" ? [styles.root, styles.rootWeb] : styles.root;

  return (
    <GestureHandlerRootView style={rootStyle}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <AppErrorBoundary>
            <AppNavigator />
          </AppErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  rootWeb: {
    height: "100%",
    width: "100%"
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: colors.background
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center"
  },
  errorMessage: {
    fontSize: 14,
    color: colors.danger,
    textAlign: "center"
  },
  errorHint: {
    fontSize: 13,
    color: colors.subtext,
    textAlign: "center"
  }
});
