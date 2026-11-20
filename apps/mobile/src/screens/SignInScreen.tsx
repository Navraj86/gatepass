import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchMe, signIn, signOut } from "../api";
import { API_URL } from "../config";
import { colors, space } from "../theme";
import type { User } from "../types";
import { Button, ErrorText, Field, Header, type TextInputRef } from "../ui";

/** The demo accounts' password is `gatepass` on the live site and `gatepass-demo` in a local database. */
const LIVE = API_URL === "https://gatepass.navraj.dev";

/** Only door staff and organizers can scan; attendees use the website. */
export const canScan = (user: User) => user.role === "staff" || user.role === "organizer";

export function SignInScreen({ onSignedIn }: { onSignedIn: (token: string, user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const passwordInput = useRef<TextInputRef>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const token = await signIn(email.trim(), password);
      const user = await fetchMe(token);
      if (!canScan(user)) {
        await signOut(token);
        setError("This app is for door staff. Sign in with a staff or organizer account.");
        return;
      }
      onSignedIn(token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.screen}>
      <Header />
      {/* Moves the form up when the keyboard opens, so the button stays visible. */}
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Scan tickets at the door</Text>
          <Text style={s.lead}>Sign in with your staff or organizer account.</Text>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordInput.current?.focus()}
          />
          <Field
            ref={passwordInput}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button label="Sign in" onPress={submit} busy={busy} />

          <Text style={s.hint}>
            Trying the demo? Use staff@gatepass.test with the password {LIVE ? "gatepass" : "gatepass-demo"}.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { padding: space.lg, gap: space.md },
  title: { fontSize: 34, fontWeight: "900", color: colors.ink, letterSpacing: -0.5, marginTop: space.md },
  lead: { fontSize: 17, color: colors.ink2, marginBottom: space.sm },
  hint: { fontSize: 15, color: colors.ink2, marginTop: space.sm },
});
