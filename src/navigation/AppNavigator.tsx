import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { SplashScreen } from "@/screens/common/SplashScreen";
import { SettingsScreen } from "@/screens/common/SettingsScreen";
import { AdminHomeScreen } from "@/screens/admin/AdminHomeScreen";
import { EmployeesScreen } from "@/screens/admin/EmployeesScreen";
import { ShiftCalendarScreen } from "@/screens/admin/ShiftCalendarScreen";
import { AdminChatScreen } from "@/screens/admin/AdminChatScreen";
import { EmployeeHomeScreen } from "@/screens/employee/EmployeeHomeScreen";
import { MyShiftScreen } from "@/screens/employee/MyShiftScreen";
import { EmployeeChatScreen } from "@/screens/employee/EmployeeChatScreen";
import { AnnouncementsScreen } from "@/screens/employee/AnnouncementsScreen";
import { restoreLocalProfileSession } from "@/lib/localSessionAuth";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

const Tab = createBottomTabNavigator();

function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtext,
        tabBarStyle: { height: 72, paddingTop: 8, paddingBottom: 10 }
      }}
    >
      <Tab.Screen
        name="Home"
        component={AdminHomeScreen}
        options={{ title: "ホーム", tabBarIcon: tabIcon("home") }}
      />
      <Tab.Screen
        name="Shifts"
        component={ShiftCalendarScreen}
        options={{ title: "シフト", tabBarIcon: tabIcon("calendar") }}
      />
      <Tab.Screen
        name="Employees"
        component={EmployeesScreen}
        options={{ title: "従業員", tabBarIcon: tabIcon("people") }}
      />
      <Tab.Screen
        name="Chat"
        component={AdminChatScreen}
        options={{ title: "チャット", tabBarIcon: tabIcon("chatbubbles") }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "設定", tabBarIcon: tabIcon("settings") }}
      />
    </Tab.Navigator>
  );
}

function EmployeeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtext,
        tabBarStyle: { height: 72, paddingTop: 8, paddingBottom: 10 }
      }}
    >
      <Tab.Screen
        name="EmployeeHome"
        component={EmployeeHomeScreen}
        options={{ title: "ホーム", tabBarIcon: tabIcon("home") }}
      />
      <Tab.Screen
        name="MyShift"
        component={MyShiftScreen}
        options={{ title: "シフト", tabBarIcon: tabIcon("calendar") }}
      />
      <Tab.Screen
        name="EmployeeChat"
        component={EmployeeChatScreen}
        options={{ title: "チャット", tabBarIcon: tabIcon("chatbubbles") }}
      />
      <Tab.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{ title: "お知らせ", tabBarIcon: tabIcon("notifications") }}
      />
      <Tab.Screen
        name="EmployeeSettings"
        component={SettingsScreen}
        options={{ title: "設定", tabBarIcon: tabIcon("settings") }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const {
    isBootstrapping,
    profile,
    setSession,
    setProfile,
    setAuthError,
    setBootstrapping
  } = useAuthStore();

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const restored = await restoreLocalProfileSession();
      if (!mounted) {
        return;
      }

      if (restored) {
        setSession(restored.session);
        setProfile(restored.profile);
        setAuthError("[LOCAL_PROFILE_RESTORED]");
      } else {
        setSession(null);
        setProfile(null);
        setAuthError(null);
      }

      setBootstrapping(false);
    })();

    return () => {
      mounted = false;
    };
  }, [setAuthError, setBootstrapping, setProfile, setSession]);

  if (isBootstrapping) {
    return <SplashScreen />;
  }

  if (!profile) {
    return (
      <NavigationContainer>
        <LoginScreen />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      {profile.role === "admin" ? <AdminTabs /> : <EmployeeTabs />}
    </NavigationContainer>
  );
}
