import { Feather } from "@expo/vector-icons";
import {
  useGetMyProfile,
  useGetProfileVideos,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StateMessage } from "@/components/StateMessage";
import { VideoPreviewTile } from "@/components/VideoPreviewTile";
import { useColors } from "@/hooks/useColors";

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const profile = useGetMyProfile();
  const videos = useGetProfileVideos(profile.data?.username ?? "", { limit: 20 }, {
    query: { enabled: !!profile.data?.username },
  });

  if (profile.isLoading) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <StateMessage title="Loading profile" detail="Fetching your creator account." loading />
      </SafeAreaView>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <StateMessage
          title="Profile isn’t available"
          detail="Check your connection and try again."
          icon="user-x"
          actionLabel="Retry"
          onAction={() => void profile.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Profile"
        action={{ label: "Open settings", icon: "settings", onPress: () => router.push("/settings" as never) }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <Avatar name={profile.data.displayName} imageUrl={profile.data.avatarUrl} size={86} />
          <Text style={[styles.displayName, { color: colors.foreground }]}>
            {profile.data.displayName}
          </Text>
          <Text style={[styles.username, { color: colors.mutedForeground }]}>
            @{profile.data.username}
          </Text>
          {profile.data.bio ? (
            <Text style={[styles.bio, { color: colors.foreground }]}>{profile.data.bio}</Text>
          ) : (
            <Text style={[styles.bioPlaceholder, { color: colors.mutedForeground }]}>
              Add a few words about yourself.
            </Text>
          )}
          <View style={styles.actions}>
            <View style={[styles.editButton, { borderColor: colors.border }]}>
              <Feather name="edit-2" size={14} color={colors.primary} />
              <Text
                accessibilityRole="link"
                onPress={() => router.push("/profile/edit" as never)}
                style={[styles.editText, { color: colors.foreground }]}
              >
                Edit profile
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.stats, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Stat label="Videos" value={profile.data.videosCount} colors={colors} />
          <Stat label="Followers" value={profile.data.followersCount} colors={colors} />
          <Stat label="Following" value={profile.data.followingCount} colors={colors} />
          <Stat label="Likes" value={profile.data.likesReceived} colors={colors} />
        </View>

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your videos</Text>
          <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
            {profile.data.videosCount}
          </Text>
        </View>
        {videos.isLoading ? (
          <StateMessage title="Loading videos" detail="Fetching your published videos." loading />
        ) : videos.isError ? (
          <StateMessage
            title="Videos aren’t available"
            detail="Try again in a moment."
            icon="alert-circle"
            actionLabel="Retry"
            onAction={() => void videos.refetch()}
          />
        ) : videos.data?.items.length ? (
          <View style={styles.videoGrid}>
            {videos.data.items.map((video) => <VideoPreviewTile key={video.id} video={video} />)}
          </View>
        ) : (
          <View style={[styles.emptyVideos, { borderColor: colors.border }]}>
            <Feather name="video" size={22} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No videos yet</Text>
            <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
              Your published videos will appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  colors,
}: {
  label: string;
  value: number;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 35 },
  identity: { alignItems: "center", paddingTop: 18, paddingBottom: 23 },
  displayName: { fontFamily: "Inter_700Bold", fontSize: 21, marginTop: 13 },
  username: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  bio: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 12, maxWidth: 310 },
  bioPlaceholder: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 17 },
  editButton: { minHeight: 40, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  editText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  stats: { borderWidth: 1, borderRadius: 18, flexDirection: "row", justifyContent: "space-around", paddingVertical: 16, marginBottom: 26 },
  stat: { alignItems: "center", gap: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 16 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 10 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  sectionMeta: { fontFamily: "Inter_500Medium", fontSize: 12 },
  videoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  emptyVideos: { alignItems: "center", borderWidth: 1, borderStyle: "dashed", borderRadius: 18, padding: 24, gap: 7 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 5 },
  emptyCopy: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", lineHeight: 18 },
});
