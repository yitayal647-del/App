import { Feather } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { VideoItem } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export function VideoPreviewTile({ video }: { video: VideoItem }) {
  const colors = useColors();
  const [playing, setPlaying] = useState(false);
  const player = useVideoPlayer(video.playbackUrl, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  const toggle = () => {
    if (playing) player.pause();
    else player.play();
    setPlaying((value) => !value);
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause video preview" : "Play video preview"}
        onPress={toggle}
        style={styles.preview}
      >
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
        {!playing ? (
          <View style={styles.playIcon}>
            <Feather name="play" size={20} color="#FFFFFF" />
          </View>
        ) : null}
      </Pressable>
      <Text numberOfLines={2} style={[styles.caption, { color: colors.foreground }]}>
        {video.caption || "Untitled video"}
      </Text>
      <Text style={[styles.stats, { color: colors.mutedForeground }]}>
        {video.likesCount} likes · {video.commentsCount} comments
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 145,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  preview: {
    height: 160,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  playIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 10,
    paddingTop: 9,
  },
  stats: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
