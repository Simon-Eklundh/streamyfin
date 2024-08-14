import { JellyfinProvider } from "@/providers/JellyfinProvider";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Provider as JotaiProvider } from "jotai";
import { useEffect, useRef, useState } from "react";
import "react-native-reanimated";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { CurrentlyPlayingBar } from "@/components/CurrentlyPlayingBar";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { useJobProcessor } from "@/utils/atoms/queue";
import { JobQueueProvider } from "@/providers/JobQueueProvider";
import { useKeepAwake } from "expo-keep-awake";
import { useSettings } from "@/utils/atoms/settings";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "(auth)/(tabs)/",
};

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <JotaiProvider>
      <Layout />
    </JotaiProvider>
  );
}

function Layout() {
  const [settings, updateSettings] = useSettings();

  useKeepAwake();

  const queryClientRef = useRef<QueryClient>(
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60,
          refetchOnMount: true,
          refetchOnReconnect: true,
          refetchOnWindowFocus: true,
          retryOnMount: true,
        },
      },
    }),
  );

  useEffect(() => {
    if (settings?.autoRotate === true)
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
    else
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
  }, [settings]);

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <JobQueueProvider>
        <ActionSheetProvider>
          <JellyfinProvider>
            <StatusBar style="light" backgroundColor="#000" />
            <ThemeProvider value={DarkTheme}>
              <Stack>
                <Stack.Screen
                  name="(auth)/(tabs)"
                  options={{
                    headerShown: false,
                    title: "Home",
                  }}
                />
                <Stack.Screen
                  name="(auth)/settings"
                  options={{
                    headerShown: true,
                    title: "Settings",
                    headerStyle: { backgroundColor: "black" },
                    headerShadowVisible: false,
                  }}
                />
                <Stack.Screen
                  name="(auth)/downloads"
                  options={{
                    headerShown: true,
                    title: "Downloads",
                    headerStyle: { backgroundColor: "black" },
                    headerShadowVisible: false,
                  }}
                />
                <Stack.Screen
                  name="(auth)/items/[id]/page"
                  options={{
                    title: "",
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="(auth)/collections/[collection]/page"
                  options={{
                    title: "",
                    headerShown: true,
                    headerStyle: { backgroundColor: "black" },
                    headerShadowVisible: false,
                  }}
                />
                <Stack.Screen
                  name="(auth)/series/[id]/page"
                  options={{
                    title: "",
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="login"
                  options={{ headerShown: false, title: "Login" }}
                />
                <Stack.Screen name="+not-found" />
              </Stack>
              <CurrentlyPlayingBar />
            </ThemeProvider>
          </JellyfinProvider>
        </ActionSheetProvider>
      </JobQueueProvider>
    </QueryClientProvider>
  );
}
