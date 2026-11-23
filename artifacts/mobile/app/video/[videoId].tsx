import { Feather } from "@expo/vector-icons";
import { useGetVideo } from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StateMessage } from "@/components/StateMessage";
import { VideoFeedCard } from "@/components/VideoFeedCard";
import { useColors } from "@/hooks/useColors";

export default function VideoScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ videoId?: string | string[] }>();
  const videoId = Array.isArray(params.videoId) ? params.videoId[0] : params.videoId ?? "";
  const video = useGetVideo(videoId, { query: { enabled: Boolean(videoId), retry: false } });
  const [height, setHeight] = useState(0);

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.video} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
        {video.isLoading ? (
          <StateMessage title="Loading video" detail="Checking that you can view this video." loading />
        ) : video.isError || !video.data ? (
          <StateMessage
            title="Video unavailable"
            detail="This video may be private, removed, or no longer available."
            icon="video-off"
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        ) : (
          <VideoFeedCard video={video.data} height={height} isActive />
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        style={styles.back}
      >
        <Feather name="arrow-left" size={19} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  video: { flex: 1 },
  back: {
    position: "absolute",
    top: 7,
    left: 14,
    zIndex: 5,
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.46)",
  },
});
