import { Feather } from "@expo/vector-icons";
import { useGetConversations, useGetNotifications } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StateMessage } from "@/components/StateMessage";
import { useColors } from "@/hooks/useColors";

type InboxTab = "messages" | "activity";

function notificationText(type: string) {
  if (type === "like") return "liked your video";
  if (type === "comment") return "commented on your video";
  return "started following you";
}

export default function InboxScreen() {
  const colors = useColors();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<InboxTab>("messages");
  const conversations = useGetConversations({
    query: { refetchInterval: 5_000, refetchIntervalInBackground: true },
  });
  const notifications = useGetNotifications({
    query: { refetchInterval: 15_000, refetchIntervalInBackground: true },
  });

  const loading = activeTab === "messages" ? conversations.isLoading : notifications.isLoading;
  const error = activeTab === "messages" ? conversations.isError : notifications.isError;
  const retry = () =>
    void (activeTab === "messages" ? conversations.refetch() : notifications.refetch());

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Inbox" subtitle="Messages and community activity" />
      <View style={[styles.tabs, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {([
          ["messages", "Messages"],
          ["activity", "Activity"],
        ] as const).map(([tab, label]) => {
          const selected = activeTab === tab;
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, selected && { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.tabText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <StateMessage
          title={activeTab === "messages" ? "Loading messages" : "Loading activity"}
          detail="Checking your latest updates."
          loading
        />
      ) : error ? (
        <StateMessage
          title={activeTab === "messages" ? "Messages aren’t available" : "Activity isn’t available"}
          detail="Check your connection and try again."
          icon="wifi-off"
          actionLabel="Retry"
          onAction={retry}
        />
      ) : activeTab === "messages" ? (
        conversations.data?.items.length ? (
          <ScrollView contentContainerStyle={styles.list}>
            {conversations.data.items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="link"
                onPress={() => router.push(`/messages/${item.id}` as never)}
                style={[styles.row, { borderBottomColor: colors.border }]}
              >
                <Avatar name={item.otherUser.displayName} imageUrl={item.otherUser.avatarUrl} size={52} />
                <View style={styles.rowCopy}>
                  <View style={styles.nameRow}>
                    <Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>
                      {item.otherUser.displayName}
                    </Text>
                    <Text style={[styles.time, { color: colors.mutedForeground }]}>
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.preview, { color: colors.mutedForeground }]}>
                    {item.lastMessage ?? `Message @${item.otherUser.username}`}
                  </Text>
                </View>
                {item.unreadCount > 0 ? (
                  <View style={[styles.unread, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.unreadText, { color: colors.primaryForeground }]}>
                      {item.unreadCount > 99 ? "99+" : item.unreadCount}
                    </Text>
                  </View>
                ) : (
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <StateMessage
            icon="message-circle"
            title="No conversations yet"
            detail="Open a creator profile and choose Message to start a private conversation."
            actionLabel="Discover creators"
            onAction={() => router.navigate("/(tabs)/discover" as never)}
          />
        )
      ) : notifications.data?.items.length ? (
        <ScrollView contentContainerStyle={styles.list}>
          {notifications.data.items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="link"
              onPress={() =>
                router.push(
                  item.videoId
                    ? `/video/${item.videoId}` as never
                    : `/creator/${item.actor.username}` as never,
                )
              }
              style={[styles.activityRow, { borderBottomColor: colors.border }]}
            >
              <Avatar name={item.actor.displayName} imageUrl={item.actor.avatarUrl} size={44} />
              <Text style={[styles.notification, { color: colors.foreground }]}>
                <Text style={[styles.actor, { color: colors.foreground }]}>
                  {item.actor.displayName}
                </Text>{" "}
                {notificationText(item.type)}.
              </Text>
              <Text style={[styles.time, { color: colors.mutedForeground }]}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <StateMessage
          icon="bell"
          title="You’re all caught up"
          detail="Likes, comments, and new followers will show here."
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabs: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
    padding: 4,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: "row",
  },
  tab: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  tabText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  row: { minHeight: 77, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowCopy: { flex: 1, gap: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  preview: { fontFamily: "Inter_400Regular", fontSize: 11 },
  time: { fontFamily: "Inter_400Regular", fontSize: 10 },
  unread: { minWidth: 21, height: 21, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadText: { fontFamily: "Inter_700Bold", fontSize: 9 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  notification: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  actor: { fontFamily: "Inter_600SemiBold" },
});
