import { Feather } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useUser } from "@clerk/expo";
import {
  getGetFeedQueryKey,
  getGetProfileQueryKey,
  useFavoriteVideo,
  useFollowProfile,
  useLikeVideo,
  useShareVideo,
  type VideoItem,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "./Avatar";

type Props = { video: VideoItem; height: number; isActive: boolean };

export function VideoFeedCard({ video, height, isActive }: Props) {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackError, setPlaybackError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [actionError, setActionError] = useState("");
  const like = useLikeVideo();
  const favorite = useFavoriteVideo();
  const follow = useFollowProfile();
  const share = useShareVideo();
  const player = useVideoPlayer(video.playbackUrl, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (isActive && isPlaying) player.play();
    else player.pause();
  }, [isActive, isPlaying, player]);

  useEffect(() => {
    const subscription = player.addListener("statusChange", (event) => {
      setPlaybackError(event.status === "error");
      setIsBuffering(event.status === "loading");
    });
    return () => subscription.remove();
  }, [player]);

  const togglePlayback = () => {
    if (isPlaying) player.pause();
    else player.play();
    setIsPlaying((value) => !value);
  };

  const handleLike = async () => {
    setActionError("");
    try {
      await like.mutateAsync({ videoId: video.id });
      await queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Your like could not be saved.");
    }
  };

  const handleFavorite = async () => {
    setActionError("");
    try {
      await favorite.mutateAsync({ videoId: video.id });
      await queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Your favorite could not be saved.");
    }
  };

  const handleFollow = async () => {
    setActionError("");
    try {
      await follow.mutateAsync({ profileId: video.creator.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(video.creator.username) }),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Follow could not be updated.");
    }
  };

  const publicShareUrl = () => {
    const base = process.env.EXPO_PUBLIC_APP_URL?.replace(/\/+$/, "");
    return base?.startsWith("https://")
      ? `${base}/api/share/${encodeURIComponent(video.id)}`
      : null;
  };

  const recordShare = async (method: "copy" | "native") => {
    await share.mutateAsync({ videoId: video.id, data: { method } });
    await queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
  };

  const copyShareLink = async () => {
    const shareUrl = publicShareUrl();
    if (!shareUrl) {
      setActionError("Public video links are not configured.");
      return;
    }
    setActionError("");
    try {
      await Clipboard.setStringAsync(shareUrl);
      await recordShare("copy");
      setShareVisible(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The video link could not be copied.");
    }
  };

  const shareWithApps = async () => {
    const shareUrl = publicShareUrl();
    if (!shareUrl) {
      setActionError("Public video links are not configured.");
      return;
    }
    setActionError("");
    try {
      const result = await Share.share(
        { message: `Watch @${video.creator.username} on YOU ALL: ${shareUrl}`, url: shareUrl },
        { dialogTitle: "Share this video" },
      );
      if (result.action === Share.sharedAction) {
        await recordShare("native");
      }
      setShareVisible(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The video could not be shared.");
    }
  };

  const ownVideo = user?.id === video.creator.id;

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      {playbackError ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.playbackError, { backgroundColor: colors.background }]}>
          <Feather name="alert-circle" size={25} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            This video could not be played.
          </Text>
          <Text style={[styles.retryText, { color: colors.primary }]}>Pull down to refresh</Text>
        </View>
      ) : null}
      {isBuffering && !playbackError ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.buffering]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause video" : "Play video"}
        onPress={togglePlayback}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bottomGradient}>
        <View style={styles.captionColumn}>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/creator/${video.creator.username}` as never)}
          >
            <Text style={styles.username}>@{video.creator.username}</Text>
          </Pressable>
          {video.caption ? (
            <>
              <Text numberOfLines={captionExpanded ? undefined : 2} style={styles.caption}>
                {video.caption}
              </Text>
              {video.caption.length > 96 ? (
                <Pressable onPress={() => setCaptionExpanded((value) => !value)}>
                  <Text style={styles.moreText}>{captionExpanded ? "less" : "more"}</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
          {video.audioTitle ? (
            <View style={styles.audioRow}>
              <Feather name="music" size={12} color="#F3D899" />
              <Text numberOfLines={1} style={styles.audioTitle}>{video.audioTitle}</Text>
            </View>
          ) : null}
          <View style={styles.creatorRow}>
            <Text numberOfLines={1} style={styles.displayName}>{video.creator.displayName}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <View style={styles.avatarAction}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open @${video.creator.username}'s profile`}
              onPress={() => router.push(`/creator/${video.creator.username}` as never)}
            >
              <Avatar name={video.creator.displayName} imageUrl={video.creator.avatarUrl} size={43} />
            </Pressable>
            {!ownVideo && !video.creator.isFollowing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Follow @${video.creator.username}`}
                disabled={follow.isPending}
                onPress={() => void handleFollow()}
                style={[styles.followBadge, { backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={12} color={colors.primaryForeground} />
              </Pressable>
            ) : null}
          </View>
          <Action
            icon="heart"
            label={String(video.likesCount)}
            active={video.isLikedByMe}
            disabled={like.isPending}
            onPress={handleLike}
          />
          <Action
            icon="message-circle"
            label={String(video.commentsCount)}
            onPress={() => router.push(`/comments/${video.id}` as never)}
          />
          <Action
            icon="send"
            label={String(video.sharesCount)}
            disabled={share.isPending}
            onPress={() => setShareVisible(true)}
          />
          <Action
            icon="bookmark"
            label={String(video.favoritesCount)}
            active={video.isFavoritedByMe}
            disabled={favorite.isPending}
            onPress={handleFavorite}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isMuted ? "Unmute video" : "Mute video"}
            onPress={() => setIsMuted((value) => !value)}
            style={styles.actionButton}
          >
            <Feather
              name={isMuted ? "volume-x" : "volume-2"}
              size={23}
              color="#FFFFFF"
            />
          </Pressable>
          {like.isPending || favorite.isPending || follow.isPending || share.isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : null}
        </View>
      </View>
      {actionError ? (
        <View style={styles.actionError}>
          <Text style={styles.actionErrorText}>{actionError}</Text>
        </View>
      ) : null}
      <Modal
        visible={shareVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setShareVisible(false)}
      >
        <Pressable style={styles.modalScrim} onPress={() => setShareVisible(false)}>
          <View style={[styles.shareSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Share this video</Text>
            <Text style={[styles.sheetCopy, { color: colors.mutedForeground }]}>
              Anyone with the link can watch this public video in a browser.
            </Text>
            {actionError ? (
              <Text style={[styles.sheetError, { color: colors.destructive }]}>{actionError}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={share.isPending}
              onPress={() => void copyShareLink()}
              style={[styles.sheetAction, { backgroundColor: colors.accent }]}
            >
              <Feather name="link" size={17} color={colors.primary} />
              <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Copy link</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={share.isPending}
              onPress={() => void shareWithApps()}
              style={[styles.sheetAction, { backgroundColor: colors.primary }]}
            >
              <Feather name="share" size={17} color={colors.primaryForeground} />
              <Text style={[styles.sheetActionText, { color: colors.primaryForeground }]}>Share with apps</Text>
            </Pressable>
            {share.isPending ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Action({
  icon,
  label,
  active = false,
  disabled = false,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${icon === "heart" ? "likes" : icon === "message-circle" ? "comments" : icon === "bookmark" ? "favorites" : "shares"}`}
      onPress={onPress}
      disabled={disabled}
      style={styles.actionButton}
    >
      <Feather name={icon} size={24} color={active ? "#E87777" : "#FFFFFF"} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  bottomGradient: {
    minHeight: 200,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 17,
    paddingTop: 80,
    paddingBottom: 88,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  captionColumn: { flex: 1, paddingRight: 12, gap: 7 },
  username: {
    color: "#F3D899",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  caption: {
    color: "#FFFFFF",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },
  moreText: { color: "#F3D899", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  displayName: {
    color: "#FFFFFF",
    flexShrink: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  audioRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  audioTitle: { color: "#F3D899", fontFamily: "Inter_500Medium", fontSize: 11, flex: 1 },
  actions: {
    width: 52,
    alignItems: "center",
    gap: 12,
    paddingBottom: 0,
  },
  avatarAction: { position: "relative", marginBottom: 2 },
  followBadge: {
    position: "absolute",
    bottom: -5,
    left: 14,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionLabel: {
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  playbackError: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  retryText: { fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 4 },
  buffering: { alignItems: "center", justifyContent: "center" },
  actionError: {
    position: "absolute",
    bottom: 238,
    left: 16,
    right: 78,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: "rgba(100,20,20,0.86)",
  },
  actionErrorText: { color: "#FFFFFF", fontFamily: "Inter_500Medium", fontSize: 10, lineHeight: 15 },
  modalScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" },
  shareSheet: {
    paddingHorizontal: 20,
    paddingTop: 11,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 11,
  },
  sheetHandle: { width: 40, height: 4, alignSelf: "center", borderRadius: 2, backgroundColor: "#6B675F", marginBottom: 5 },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 17, textAlign: "center" },
  sheetCopy: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", lineHeight: 17, marginBottom: 4 },
  sheetError: { fontFamily: "Inter_500Medium", fontSize: 11, textAlign: "center" },
  sheetAction: { minHeight: 48, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  sheetActionText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
