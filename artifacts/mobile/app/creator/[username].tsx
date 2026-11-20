import { Feather } from "@expo/vector-icons";
import {
  getGetProfileQueryKey,
  useFollowProfile,
  useGetProfile,
  useGetProfileVideos,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "@/components/AppButton";
import { Avatar } from "@/components/Avatar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StateMessage } from "@/components/StateMessage";
import { VideoPreviewTile } from "@/components/VideoPreviewTile";
import { useColors } from "@/hooks/useColors";

export default function CreatorScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username ?? "";
  const profile = useGetProfile(username, { query: { enabled: !!username } });
  const videos = useGetProfileVideos(username, { limit: 20 }, { query: { enabled: !!username } });
  const followMutation = useFollowProfile();
  const [actionError, setActionError] = useState("");

  const toggleFollow = async () => {
    if (!profile.data) return;
    setActionError("");
    try {
      await followMutation.mutateAsync({ profileId: profile.data.id });
      await queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(username) });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Follow could not be updated.");
    }
  };

  if (profile.isLoading) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <StateMessage title="Loading creator" detail="Fetching this profile." loading />
      </SafeAreaView>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Creator" back />
        <StateMessage
          title="Creator not found"
          detail="This profile may have been removed or the username may be incorrect."
          icon="user-x"
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={`@${profile.data.username}`} back />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <Avatar name={profile.data.displayName} imageUrl={profile.data.avatarUrl} size={88} />
          <Text style={[styles.displayName, { color: colors.foreground }]}>
            {profile.data.displayName}
          </Text>
          <Text style={[styles.username, { color: colors.mutedForeground }]}>
            @{profile.data.username}
          </Text>
          {profile.data.bio ? (
            <Text style={[styles.bio, { color: colors.foreground }]}>{profile.data.bio}</Text>
          ) : null}
          <View style={styles.followButton}>
            <AppButton
              label={profile.data.isFollowing ? "Following" : "Follow"}
              onPress={() => void toggleFollow()}
              loading={followMutation.isPending}
              variant={profile.data.isFollowing ? "secondary" : "primary"}
            />
          </View>
          {actionError ? <Text style={[styles.error, { color: colors.destructive }]}>{actionError}</Text> : null}
        </View>
        <View style={[styles.stats, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Stat label="Videos" value={profile.data.videosCount} />
          <Stat label="Followers" value={profile.data.followersCount} />
          <Stat label="Following" value={profile.data.followingCount} />
          <Stat label="Likes" value={profile.data.likesReceived} />
        </View>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Videos</Text>
          <Feather name="video" size={16} color={colors.primary} />
        </View>
        {videos.isLoading ? (
          <StateMessage title="Loading videos" detail="Fetching public videos." loading />
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
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No public videos yet</Text>
            <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
              New videos will appear here when this creator publishes them.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const colors = useColors();
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
  identity: { alignItems: "center", paddingTop: 17, paddingBottom: 20 },
  displayName: { fontFamily: "Inter_700Bold", fontSize: 21, marginTop: 13 },
  username: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  bio: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 12, maxWidth: 310 },
  followButton: { width: 180, marginTop: 17 },
  error: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 10 },
  stats: { borderWidth: 1, borderRadius: 18, flexDirection: "row", justifyContent: "space-around", paddingVertical: 16, marginBottom: 26 },
  stat: { alignItems: "center", gap: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 16 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 10 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  videoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  emptyVideos: { alignItems: "center", borderWidth: 1, borderStyle: "dashed", borderRadius: 18, padding: 24, gap: 7 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  emptyCopy: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", lineHeight: 18 },
});
