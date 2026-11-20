import { useGetNotifications } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StateMessage } from "@/components/StateMessage";
import { useColors } from "@/hooks/useColors";

function notificationText(type: string) {
  if (type === "like") return "liked your video";
  if (type === "comment") return "commented on your video";
  return "started following you";
}

export default function InboxScreen() {
  const colors = useColors();
  const router = useRouter();
  const notifications = useGetNotifications();

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Inbox" subtitle="Updates from your community" />
      {notifications.isLoading ? (
        <StateMessage title="Loading inbox" detail="Checking your latest activity." loading />
      ) : notifications.isError ? (
        <StateMessage
          title="Inbox isn’t available"
          detail="Check your connection and try again."
          icon="bell-off"
          actionLabel="Retry"
          onAction={() => void notifications.refetch()}
        />
      ) : notifications.data?.items.length ? (
        <ScrollView contentContainerStyle={styles.list}>
          {notifications.data.items.map((item) => (
            <View key={item.id} style={[styles.row, { borderBottomColor: colors.border }]}>
              <Avatar
                name={item.actor.displayName}
                imageUrl={item.actor.avatarUrl}
                size={45}
              />
              <Text style={[styles.notification, { color: colors.foreground }]}>
                <Text
                  accessibilityRole="link"
                  onPress={() => router.push(`/creator/${item.actor.username}` as never)}
                  style={styles.actor}
                >
                  {item.actor.displayName}
                </Text>{" "}
                {notificationText(item.type)}.
              </Text>
              <Text style={[styles.date, { color: colors.mutedForeground }]}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <StateMessage
          icon="bell"
          title="You’re all caught up"
          detail="Likes, comments, and new followers will show here."
        />
      )}
      <View style={[styles.messagesNote, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.noteLabel, { color: colors.primary }]}>DIRECT MESSAGES</Text>
        <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
          Private messaging is not available in this version.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  notification: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  actor: { fontFamily: "Inter_600SemiBold" },
  date: { fontFamily: "Inter_400Regular", fontSize: 10 },
  messagesNote: { borderTopWidth: 1, paddingVertical: 17, paddingHorizontal: 20 },
  noteLabel: { fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 1.7 },
  noteText: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 5 },
});
