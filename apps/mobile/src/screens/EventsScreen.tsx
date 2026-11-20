import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ApiError, api } from "../api";
import { colors, space } from "../theme";
import type { StaffEvent, User } from "../types";
import { ErrorText, Header } from "../ui";

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EventsScreen({
  token,
  user,
  onOpen,
  onSignOut,
}: {
  token: string;
  user: User;
  onOpen: (event: StaffEvent) => void;
  onSignOut: () => void;
}) {
  const [events, setEvents] = useState<StaffEvent[]>();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      // The same endpoint the website's staff page uses: assigned events, with live check-in counts.
      const { events } = await api<{ events: StaffEvent[] }>("/api/staff/events", { token });
      setEvents(events);
      setError(undefined);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onSignOut(); // session ended or revoked
      setError(err instanceof Error ? err.message : "Could not load events.");
    }
  }, [token, onSignOut]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={s.screen}>
      <Header action={{ label: "Sign out", onPress: onSignOut }} />
      <FlatList
        data={events ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View style={s.intro}>
            <Text style={s.title}>Pick an event</Text>
            <Text style={s.lead}>Signed in as {user.name}.</Text>
            {error ? <ErrorText>{error}</ErrorText> : null}
            {events === undefined && !error ? <ActivityIndicator color={colors.ink} /> : null}
          </View>
        }
        ListEmptyComponent={
          events ? (
            <Text style={s.lead}>No events to scan yet. An organizer has to assign you to an event first.</Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens the scanner for this event"
            onPress={() => onOpen(item)}
            style={({ pressed }) => [s.row, pressed && s.pressed]}
          >
            <View style={s.rowText}>
              <Text style={s.eventTitle}>{item.title}</Text>
              <Text style={s.meta}>
                {item.venue}, {formatWhen(item.startsAt)}
              </Text>
            </View>
            <View style={s.count}>
              <Text style={s.countFigure}>{item.checkedIn.toLocaleString()}</Text>
              <Text style={s.meta}>of {item.validTickets.toLocaleString()} in</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { padding: space.lg, gap: space.sm },
  intro: { gap: space.sm, marginBottom: space.md },
  title: { fontSize: 34, fontWeight: "900", color: colors.ink, letterSpacing: -0.5, marginTop: space.md },
  lead: { fontSize: 17, color: colors.ink2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderTopWidth: 4,
    borderTopColor: colors.ink,
    backgroundColor: colors.paper2,
    padding: space.md,
    minHeight: 72,
  },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1, gap: 2 },
  eventTitle: { fontSize: 19, fontWeight: "800", color: colors.ink },
  meta: { fontSize: 14, color: colors.ink2 },
  count: { alignItems: "flex-end" },
  countFigure: { fontSize: 26, fontWeight: "900", color: colors.ink, fontVariant: ["tabular-nums"] },
});
