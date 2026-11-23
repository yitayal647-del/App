import { Feather } from "@expo/vector-icons";
import {
  getGetConversationsQueryKey,
  getGetProfileQueryKey,
  getGetProfileVideosQueryKey,
  useBlockUser,
  useFollowProfile,
  useGetProfile,
  useGetProfileVideos,
  useStartConversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "@clerk/expo";
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
  const { user } = useUser();
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username ?? "";
  const profile = useGetProfile(username, { query: { enabled: !!username } });
  const videos = useGetProfileVideos(username, { limit: 20 }, { query: { enabled: !!username } });
  const followMutation = useFollowProfile();
  const startConversation = useStartConversation();
  const blockUser = useBlockUser();
  const [actionError, setActionError] = useState("");
  const [confirmBlock, setConfirmBlock] = useState(false);

  const toggleFollow = async () => {
    if (!profile.data) return;
    setActionError("");
    try {
      await followMutation.mutateAsync({ profileId: profile.data.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(username) }),
        queryClient.invalidateQueries({ queryKey: getGetProfileVideosQueryKey(username) }),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Follow could not be updated.");
    }
  };

  const messageCreator = async () => {
    if (!profile.data) return;
    setActionError("");
    try {
      const conversation = await startConversation.mutateAsync({
        data: { userId: profile.data.id },
      });
      await queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      router.push(`/messages/${conversation.id}` as never);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "This creator’s message settings do not allow a new chat.",
      );
    }
  };

  const confirmAndBlock = async () => {
    if (!profile.data) return;
    setActionError("");
    try {
      await blockUser.mutateAsync({ userId: profile.data.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(username) }),
        queryClient.invalidateQueries({ queryKey: getGetProfileVideosQueryKey(username) }),
        queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() }),
      ]);
      setConfirmBlock(false);
      router.back();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "This account could not be blocked.");
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
          {user?.id !== profile.data.id ? (
            <>
              <View style={styles.profileActions}>
                <View style={styles.actionButton}>
                  <AppButton
                    label={profile.data.isFollowing ? "Following" : "Follow"}
                    onPress={() => void toggleFollow()}
                    loading={followMutation.isPending}
                    variant={profile.data.isFollowing ? "secondary" : "primary"}
                  />
                </View>
                <View style={styles.actionButton}>
                  <AppButton
                    label="Message"
                    onPress={() => void messageCreator()}
                    loading={startConversation.isPending}
                    variant="secondary"
                  />
                </View>
              </View>
              <View style={styles.secondaryActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/report/${profile.data.id}` as never)}
                  style={[styles.textAction, { borderColor: colors.border }]}
                >
                  <Feather name="flag" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.textActionLabel, { color: colors.mutedForeground }]}>Report</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmBlock(true)}
                  style={[styles.textAction, { borderColor: colors.border }]}
                >
                  <Feather name="slash" size={13} color={colors.destructive} />
                  <Text style={[styles.textActionLabel, { color: colors.destructive }]}>Block</Text>
                </Pressable>
              </View>
            </>
          ) : null}
          {actionError ? <Text style={[styles.error, { color: colors.destructive }]}>{actionError}</Text> : null}
        </View>
        <View style={[styles.stats, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Stat label="Videos" value={profile.data.videosCount} />
          <Stat
            label="Followers"
            value={profile.data.followersCount}
            onPress={() => router.push(`/people/${profile.data.username}/followers` as never)}
          />
          <Stat
            label="Following"
            value={profile.data.followingCount}
            onPress={() => router.push(`/people/${profile.data.username}/following` as never)}
          />
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
      <Modal visible={confirmBlock} transparent animationType="fade" onRequestClose={() => setConfirmBlock(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
              Block @{profile.data.username}?
            </Text>
            <Text style={[styles.confirmCopy, { color: colors.mutedForeground }]}>
              They won’t be able to message you, and your follow connection will be removed.
            </Text>
            <AppButton
              label="Block account"
              onPress={() => void confirmAndBlock()}
              loading={blockUser.isPending}
            />
            <Pressable onPress={() => setConfirmBlock(false)} style={styles.cancelBlock}>
              <Text style={[styles.cancelBlockText, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={styles.stat}
    >
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 35 },
  identity: { alignItems: "center", paddingTop: 17, paddingBottom: 20 },
  displayName: { fontFamily: "Inter_700Bold", fontSize: 21, marginTop: 13 },
  username: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  bio: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 12, maxWidth: 310 },
  profileActions: { width: "100%", flexDirection: "row", gap: 9, marginTop: 17 },
  actionButton: { flex: 1 },
  secondaryActions: { flexDirection: "row", gap: 12, marginTop: 12 },
  textAction: { minHeight: 34, paddingHorizontal: 11, borderWidth: 1, borderRadius: 11, flexDirection: "row", alignItems: "center", gap: 6 },
  textActionLabel: { fontFamily: "Inter_500Medium", fontSize: 10 },
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
  modalScrim: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.7)" },
  confirmCard: { width: "100%", maxWidth: 380, borderWidth: 1, borderRadius: 20, padding: 20, gap: 12 },
  confirmTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  confirmCopy: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginBottom: 4 },
  cancelBlock: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  cancelBlockText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
