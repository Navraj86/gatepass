import type { ComponentRef, ReactNode, Ref } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, space } from "./theme";

/** The ink bar at the top of every screen, like the website's header. */
export function Header({ action }: { action?: { label: string; onPress: () => void } }) {
  // Insets keep the bar's content below the notch or status bar on every phone.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <Text style={styles.wordmark} accessibilityRole="header">
        Gatepass
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          hitSlop={12}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
        >
          <Text style={styles.headerActionLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  busy = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonLabel}>{label}</Text>}
    </Pressable>
  );
}

/** What a ref to a TextInput holds, for focusing a field from code. */
export type TextInputRef = ComponentRef<typeof TextInput>;

export function Field({ label, ref, ...input }: TextInputProps & { label: string; ref?: Ref<TextInputRef> }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.ink2}
        style={styles.input}
        {...input}
      />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.error} accessibilityRole="alert">
      {children}
    </Text>
  );
}

export const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
  },
  wordmark: { color: colors.onInk, fontSize: 24, fontWeight: "900", letterSpacing: -0.5, paddingVertical: 14 },
  headerAction: { minHeight: 44, justifyContent: "center" },
  headerActionLabel: {
    color: colors.onInk,
    fontSize: 16,
    fontWeight: "600",
    textDecorationLine: "underline",
    textDecorationColor: colors.accent,
  },
  button: { minHeight: 52, paddingHorizontal: space.lg, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 2, borderColor: colors.ink },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  buttonLabel: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  field: { gap: space.xs },
  label: { color: colors.ink2, fontSize: 15, fontWeight: "600" },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    paddingHorizontal: space.md,
    fontSize: 17,
    color: colors.ink,
  },
  error: { color: colors.error, fontSize: 15, fontWeight: "600" },
});
