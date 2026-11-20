import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApiError, fetchMe, signOut } from "./src/api";
import { EventsScreen } from "./src/screens/EventsScreen";
import { ScannerScreen } from "./src/screens/ScannerScreen";
import { canScan, SignInScreen } from "./src/screens/SignInScreen";
import { clearToken, loadToken, saveToken } from "./src/session";
import { colors } from "./src/theme";
import type { StaffEvent, User } from "./src/types";

/**
 * Three screens, so no navigation library: the app is in exactly one of these states and
 * renders the matching screen. Going "back" is just setting the previous state.
 */
type Screen = { name: "starting" } | { name: "signIn" } | { name: "events" } | { name: "scan"; event: StaffEvent };
type Session = { token: string; user: User };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "starting" });
  const [session, setSession] = useState<Session>();

  // On launch, reuse the token saved last time if the server still accepts it.
  useEffect(() => {
    (async () => {
      const token = await loadToken();
      if (token) {
        try {
          const user = await fetchMe(token);
          if (canScan(user)) {
            setSession({ token, user });
            setScreen({ name: "events" });
            return;
          }
        } catch (err) {
          // Only a refused token is thrown away; with no signal it is kept for the next launch.
          if (!(err instanceof ApiError && err.status === 401)) {
            setScreen({ name: "signIn" });
            return;
          }
        }
        await clearToken();
      }
      setScreen({ name: "signIn" });
    })();
  }, []);

  const signedIn = useCallback(async (token: string, user: User) => {
    await saveToken(token);
    setSession({ token, user });
    setScreen({ name: "events" });
  }, []);

  const signedOut = useCallback(() => {
    if (session) void signOut(session.token);
    void clearToken();
    setSession(undefined);
    setScreen({ name: "signIn" });
  }, [session]);

  // Android's back button: from the scanner it returns to the event list instead of closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen.name !== "scan") return false;
      setScreen({ name: "events" });
      return true;
    });
    return () => sub.remove();
  }, [screen.name]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {screen.name === "starting" ? (
        <View style={styles.starting}>
          <ActivityIndicator color={colors.onInk} size="large" />
        </View>
      ) : screen.name === "signIn" || !session ? (
        <SignInScreen onSignedIn={signedIn} />
      ) : screen.name === "events" ? (
        <EventsScreen
          token={session.token}
          user={session.user}
          onOpen={(event) => setScreen({ name: "scan", event })}
          onSignOut={signedOut}
        />
      ) : (
        <ScannerScreen
          token={session.token}
          event={screen.event}
          onBack={() => setScreen({ name: "events" })}
          onSignOut={signedOut}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  starting: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink },
});
