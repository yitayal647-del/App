import { Feather } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFeedQueryKey,
  useLikeVideo,
  type VideoItem,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "./Avatar";

type Props = { video: VideoItem; height: number; isActive: boolean };

export function VideoFeedCard({ video, height, isActive }: Props) {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackError, setPlaybackError] = useState(false);
  const like = useLikeVideo();
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
    });
    return () => subscription.remove();
  }, [player]);

  const togglePlayback = () => {
    if (isPlaying) player.pause();
    else player.play();
    setIsPlaying((value) => !value);
  };

  const handleLike = async () => {
    try {
      await like.mutateAsync({ videoId: video.id });
      await queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
    } catch {
      // The API error is reflected by leaving the server-confirmed state unchanged.
    }
  };

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      {playbackError ? (
        <View style={[StyleSheet.absoluteFill, styles.playbackError, { backgroundColor: colors.background }]}>
          <Feather name="alert-circle" size={25} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            This video could not be played.
          </Text>
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
          {video.caption ? <Text style={styles.caption}>{video.caption}</Text> : null}
          <View style={styles.creatorRow}>
            <Avatar
              name={video.creator.displayName}
              imageUrl={video.creator.avatarUrl}
              size={34}
            />
            <Text numberOfLines={1} style={styles.displayName}>
              {video.creator.displayName}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/creator/${video.creator.username}` as never)}
              style={styles.profilePill}
            >
              <Text style={styles.profilePillText}>View profile</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.actions}>
          <Action
            icon={video.isLikedByMe ? "heart" : "heart"}
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
          {like.isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : null}
        </View>
      </View>
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
      accessibilityLabel={`${label} ${icon === "heart" ? "likes" : "comments"}`}
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
    paddingBottom: 24,
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
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 5,
  },
  displayName: {
    color: "#FFFFFF",
    flexShrink: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  profilePill: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  profilePillText: {
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  actions: {
    width: 48,
    alignItems: "center",
    gap: 18,
    paddingBottom: 4,
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
});
