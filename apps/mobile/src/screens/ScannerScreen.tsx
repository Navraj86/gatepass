import { formatTicketCode, normalizeTicketCode } from "@gatepass/shared";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api } from "../api";
import { colors, space } from "../theme";
import type { ScanResult, StaffEvent } from "../types";
import { Button, ErrorText, Header } from "../ui";
import { formatWhen } from "./EventsScreen";

/** How long a verdict fills the screen, and how long the camera ignores the same QR afterwards. */
const SHOW_MS = 1800;
const REPEAT_MS = 4000;
/** Other staff are scanning too, so the counter refreshes from the server every few seconds. */
const COUNTS_MS = 15_000;

type Logged = { id: number; at: Date; code: string; scan: ScanResult };

/** Turns the API's answer into what staff see: a colour, a big word and one line of detail. */
function describe(scan: ScanResult) {
  switch (scan.result) {
    case "valid":
      return {
        title: "Valid",
        detail: `${scan.seat.sectionName}, row ${scan.seat.rowLabel}, seat ${scan.seat.seatNumber}`,
        who: scan.holderName,
        bg: colors.accent,
        fg: colors.ink,
      };
    case "duplicate":
      return {
        title: "Already scanned",
        detail: `${formatWhen(scan.scannedAt)} by ${scan.scannedByName}`,
        bg: colors.accent2,
        fg: colors.ink,
      };
    case "refunded":
      return { title: "Refunded", detail: "This ticket was refunded and is void.", bg: colors.error, fg: colors.paper };
    case "wrong_event":
      return {
        title: "Wrong event",
        detail: `This ticket is for ${scan.eventTitle}.`,
        bg: colors.error,
        fg: colors.paper,
      };
    default:
      return {
        title: "Not a ticket",
        detail: "This code is not a Gatepass ticket.",
        bg: colors.error,
        fg: colors.paper,
      };
  }
}

export function ScannerScreen({
  token,
  event,
  onBack,
  onSignOut,
}: {
  token: string;
  event: StaffEvent;
  onBack: () => void;
  onSignOut: () => void;
}) {
  useKeepAwake(); // the screen stays on while the scanner is open
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [counts, setCounts] = useState({ checkedIn: event.checkedIn, validTickets: event.validTickets });
  const [verdict, setVerdict] = useState<Logged>();
  const [log, setLog] = useState<Logged[]>([]);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string>();

  // Refs, not state: they change many times a second and must not re-render the screen.
  const busy = useRef(false);
  const lastCode = useRef<{ code: string; at: number }>(undefined);
  const nextId = useRef(1);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Keep the "12 of 340 in" counter honest while other phones at the door scan too.
  useEffect(() => {
    const refresh = async () => {
      try {
        const { events } = await api<{ events: StaffEvent[] }>("/api/staff/events", { token });
        const fresh = events.find((e) => e.id === event.id);
        if (fresh) setCounts({ checkedIn: fresh.checkedIn, validTickets: fresh.validTickets });
      } catch {
        // A missed refresh is harmless; the next one catches up.
      }
    };
    const timer = setInterval(refresh, COUNTS_MS);
    return () => clearInterval(timer);
  }, [token, event.id]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const check = useCallback(
    async (raw: string, fromCamera: boolean) => {
      const code = normalizeTicketCode(raw) || raw.trim();
      const now = Date.now();
      // The camera reports the same QR many times a second: one request at a time, and the
      // same code is ignored for a few seconds. A typed code is always checked.
      if (busy.current) return false;
      if (fromCamera && lastCode.current?.code === code && now - lastCode.current.at < REPEAT_MS) return false;
      busy.current = true;
      lastCode.current = { code, at: now };
      setError(undefined);

      try {
        // The server decides. Its single conditional UPDATE is what makes check-in exactly-once,
        // even when two phones scan the same ticket at the same moment.
        const scan = await api<ScanResult>("/api/staff/scan", {
          method: "POST",
          token,
          body: { eventId: event.id, code },
        });
        const entry = { id: nextId.current++, at: new Date(), code, scan };
        const ok = scan.result === "valid";

        void Haptics.notificationAsync(
          ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
        );
        AccessibilityInfo.announceForAccessibility(describe(scan).title);
        if (ok) setCounts((c) => ({ ...c, checkedIn: c.checkedIn + 1 }));
        setLog((prev) => [entry, ...prev].slice(0, 6));
        setVerdict(entry);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setVerdict((v) => (v?.id === entry.id ? undefined : v)), SHOW_MS);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onSignOut();
          return false;
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setError(err instanceof Error ? err.message : "Could not check the ticket.");
        return false;
      } finally {
        busy.current = false;
      }
    },
    [token, event.id, onSignOut],
  );

  async function checkTyped() {
    if (!manual.trim()) return;
    if (await check(manual, false)) setManual("");
  }

  const shown = verdict ? describe(verdict.scan) : undefined;

  return (
    <View style={s.screen}>
      <Header action={{ label: "Events", onPress: onBack }} />

      <View style={s.top}>
        <View style={s.topText}>
          <Text style={s.title} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={s.meta}>{event.venue}</Text>
        </View>
        <View style={s.count} accessible accessibilityLabel={`${counts.checkedIn} of ${counts.validTickets} in`}>
          <Text style={s.countFigure}>{counts.checkedIn.toLocaleString()}</Text>
          <Text style={s.meta}>of {counts.validTickets.toLocaleString()} in</Text>
        </View>
      </View>

      <View style={s.camera}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            // Undefined pauses scanning while a verdict is on screen.
            onBarcodeScanned={verdict ? undefined : ({ data }) => void check(data, true)}
          />
        ) : permission ? (
          <View style={s.cameraOff}>
            <Text style={s.cameraOffText}>
              {permission.canAskAgain
                ? "Allow the camera to scan ticket QR codes."
                : "The camera is off for Gatepass Scan. Turn it on in Settings, or type codes below."}
            </Text>
            <Button
              label={permission.canAskAgain ? "Allow camera" : "Open Settings"}
              onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
            />
          </View>
        ) : null}
        {permission?.granted ? <View style={s.frame} pointerEvents="none" /> : null}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[s.panel, { paddingBottom: insets.bottom + space.md }]}>
          <View style={s.manual}>
            <TextInput
              accessibilityLabel="Ticket code"
              placeholder="Type a ticket code"
              placeholderTextColor={colors.ink2}
              value={manual}
              onChangeText={setManual}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={checkTyped}
              style={s.input}
            />
            <Button label="Check" variant="secondary" onPress={checkTyped} />
          </View>
          {error ? <ErrorText>{error}</ErrorText> : null}

          {log.map((entry) => {
            const d = describe(entry.scan);
            return (
              <View key={entry.id} style={s.logRow}>
                <Text style={[s.logTag, { backgroundColor: d.bg, color: d.fg }]}>{d.title}</Text>
                <Text style={s.logDetail} numberOfLines={1}>
                  {d.who ? `${d.who}, ` : ""}
                  {"seat" in entry.scan ? d.detail : formatTicketCode(entry.code)}
                </Text>
                <Text style={s.meta}>
                  {entry.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                </Text>
              </View>
            );
          })}
        </View>
      </KeyboardAvoidingView>

      {verdict && shown ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${shown.title}. ${shown.detail}. Tap to scan the next ticket.`}
          onPress={() => setVerdict(undefined)}
          style={[s.verdict, { backgroundColor: shown.bg, paddingBottom: insets.bottom + space.xl }]}
        >
          <Text style={[s.verdictTitle, { color: shown.fg }]}>{shown.title}</Text>
          <Text style={[s.verdictDetail, { color: shown.fg }]}>{shown.detail}</Text>
          {shown.who ? <Text style={[s.verdictWho, { color: shown.fg }]}>{shown.who}</Text> : null}
          <Text style={[s.verdictHint, { color: shown.fg }]}>Tap to scan the next ticket</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  top: { flexDirection: "row", alignItems: "flex-end", gap: space.md, padding: space.md },
  topText: { flex: 1, gap: 2 },
  title: { fontSize: 22, fontWeight: "900", color: colors.ink },
  meta: { fontSize: 14, color: colors.ink2 },
  count: { alignItems: "flex-end" },
  countFigure: { fontSize: 34, fontWeight: "900", color: colors.ink, fontVariant: ["tabular-nums"] },
  camera: { flex: 1, backgroundColor: colors.ink, overflow: "hidden" },
  frame: {
    position: "absolute",
    alignSelf: "center",
    top: "18%",
    width: "62%",
    aspectRatio: 1,
    borderWidth: 4,
    borderColor: colors.accent,
  },
  cameraOff: { flex: 1, justifyContent: "center", padding: space.lg, gap: space.md },
  cameraOffText: { color: colors.onInk, fontSize: 17 },
  panel: { padding: space.md, gap: space.sm, borderTopWidth: 4, borderTopColor: colors.ink },
  manual: { flexDirection: "row", gap: space.sm },
  input: {
    flex: 1,
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: space.md,
    fontSize: 17,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  logRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 },
  logTag: { width: 120, textAlign: "center", fontSize: 13, fontWeight: "700", paddingVertical: 3 },
  logDetail: { flex: 1, fontSize: 14, color: colors.ink2 },
  verdict: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", padding: space.lg, gap: space.md },
  verdictTitle: { fontSize: 64, fontWeight: "900", letterSpacing: -1.5, lineHeight: 68 },
  verdictDetail: { fontSize: 24, fontWeight: "700" },
  verdictWho: { fontSize: 20, fontWeight: "600" },
  verdictHint: { fontSize: 16, fontWeight: "600", marginTop: space.lg },
});
