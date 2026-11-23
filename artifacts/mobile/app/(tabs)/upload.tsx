import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { File, UploadTask, UploadType } from "expo-file-system";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  getGetFeedQueryKey,
  getGetMyProfileQueryKey,
  getGetProfileVideosQueryKey,
  usePublishVideo,
  useRequestUploadUrl,
  type PublishVideoBodyVisibility,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "@/components/AppButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_SECONDS = 180;
const allowedTypes = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);

export default function UploadScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const requestUpload = useRequestUploadUrl();
  const publishVideo = usePublishVideo();
  const uploadTask = useRef<UploadTask | null>(null);
  const wasCancelled = useRef(false);
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [audioTitle, setAudioTitle] = useState("");
  const [visibility, setVisibility] = useState<PublishVideoBodyVisibility>("public");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "uploading" | "publishing">("idle");
  const [error, setError] = useState("");

  const player = useVideoPlayer(asset?.uri ?? null, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });
  const busy = stage !== "idle";
  const durationSec = asset?.duration ? asset.duration / 1000 : 0;
  const fileSize = asset?.fileSize ?? (asset?.uri ? new File(asset.uri).size : 0);
  const contentType =
    asset?.mimeType?.toLowerCase() ??
    (asset?.uri.toLowerCase().endsWith(".mov")
      ? "video/quicktime"
      : asset?.uri.toLowerCase().endsWith(".mp4")
        ? "video/mp4"
        : "");
  const canPublish =
    !!asset &&
    !!contentType &&
    allowedTypes.has(contentType) &&
    fileSize > 0 &&
    fileSize <= MAX_BYTES &&
    durationSec > 0 &&
    durationSec <= MAX_SECONDS;

  const chooseVideo = async () => {
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(
          permission.canAskAgain
            ? "Allow video library access to choose a video."
            : "Video library access is off. Enable it in your device settings to choose a video.",
        );
        if (!permission.canAskAgain && Platform.OS !== "web") {
          Alert.alert(
            "Video access is off",
            "Enable photo library access in device settings to choose a video.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open settings", onPress: () => void Linking.openSettings() },
            ],
          );
        }
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        videoMaxDuration: MAX_SECONDS,
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      const nextAsset = result.assets[0];
      const nextSize = nextAsset.fileSize ?? new File(nextAsset.uri).size;
      const nextType =
        nextAsset.mimeType?.toLowerCase() ??
        (nextAsset.uri.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
      if (!allowedTypes.has(nextType)) {
        setError("Choose an MP4 or MOV video.");
        return;
      }
      if (!nextSize || nextSize > MAX_BYTES) {
        setError("Choose a video smaller than 100 MB.");
        return;
      }
      if (!nextAsset.duration || nextAsset.duration <= 0 || nextAsset.duration > MAX_SECONDS * 1000) {
        setError("Choose a video that is no longer than three minutes.");
        return;
      }
      setAsset(nextAsset);
      setProgress(0);
      setCaption("");
      setAudioTitle("");
      setVisibility("public");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The video library could not be opened.");
    }
  };

  const cancelUpload = () => {
    wasCancelled.current = true;
    uploadTask.current?.cancel();
    uploadTask.current = null;
    setStage("idle");
    setProgress(0);
  };

  const publish = async () => {
    if (!asset || !canPublish) {
      setError("Choose an MP4 or MOV under 100 MB and three minutes.");
      return;
    }
    wasCancelled.current = false;
    setError("");
    try {
      setStage("uploading");
      const name = asset.fileName ?? asset.uri.split("/").pop() ?? "video";
      const signed = await requestUpload.mutateAsync({
        data: { name, size: Math.floor(fileSize), contentType },
      });
      const task = new File(asset.uri).createUploadTask(signed.uploadURL, {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        headers: { "Content-Type": contentType },
        onProgress: ({ bytesSent, totalBytes }) => {
          if (totalBytes > 0) setProgress(Math.min(1, bytesSent / totalBytes));
        },
      });
      uploadTask.current = task;
      const uploadResult = await task.uploadAsync();
      uploadTask.current = null;
      if (wasCancelled.current) return;
      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Video upload failed with status ${uploadResult.status}. Try again.`);
      }

      setStage("publishing");
      const published = await publishVideo.mutateAsync({
        data: {
          objectPath: signed.objectPath,
          caption: caption.trim(),
          audioTitle: audioTitle.trim(),
          durationSec,
          sizeBytes: Math.floor(fileSize),
          contentType,
          visibility,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }),
        queryClient.invalidateQueries({
          queryKey: getGetProfileVideosQueryKey(published.creator.username, { limit: 20 }),
        }),
      ]);
      setAsset(null);
      setCaption("");
      setAudioTitle("");
      setVisibility("public");
      setStage("idle");
      setProgress(0);
      router.replace("/(tabs)");
    } catch (cause) {
      if (!wasCancelled.current) {
        setError(cause instanceof Error ? cause.message : "The video could not be published.");
      }
      setStage("idle");
      setProgress(0);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Create" subtitle="Share a video with your community" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!asset ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void chooseVideo()}
            style={[styles.pickCard, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={[styles.uploadIcon, { backgroundColor: colors.accent }]}>
              <Feather name="upload-cloud" size={27} color={colors.primary} />
            </View>
            <Text style={[styles.pickTitle, { color: colors.foreground }]}>Choose a video</Text>
            <Text style={[styles.pickCopy, { color: colors.mutedForeground }]}>
              Select an MP4 or MOV from your library. Up to 100 MB and three minutes.
            </Text>
            <View style={[styles.pickButton, { backgroundColor: colors.primary }]}>
              <Text style={[styles.pickButtonText, { color: colors.primaryForeground }]}>
                Open video library
              </Text>
            </View>
          </Pressable>
        ) : (
          <>
            <View style={[styles.previewShell, { borderColor: colors.border }]}>
              <VideoView
                player={player}
                style={styles.preview}
                contentFit="contain"
                nativeControls
              />
            </View>
            <View style={styles.fileMeta}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>
                  {asset.fileName ?? "Selected video"}
                </Text>
                <Text style={[styles.fileDetail, { color: colors.mutedForeground }]}>
                  {(fileSize / (1024 * 1024)).toFixed(1)} MB · {Math.round(durationSec)} sec
                </Text>
              </View>
              {!busy ? (
                <Pressable accessibilityRole="button" onPress={() => setAsset(null)}>
                  <Text style={[styles.changeText, { color: colors.primary }]}>Change</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.label, { color: colors.foreground }]}>Caption</Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              maxLength={2200}
              multiline
              placeholder="Tell the story behind your video"
              placeholderTextColor={colors.mutedForeground}
              editable={!busy}
              style={[
                styles.captionInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
              ]}
            />
            <Text style={[styles.counter, { color: colors.mutedForeground }]}>
              {caption.length}/2200
            </Text>
            <Text style={[styles.label, { color: colors.foreground }]}>Audio credit</Text>
            <TextInput
              value={audioTitle}
              onChangeText={setAudioTitle}
              maxLength={100}
              placeholder="Optional track or sound title"
              placeholderTextColor={colors.mutedForeground}
              editable={!busy}
              style={[
                styles.audioInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
              ]}
            />
            <Text style={[styles.label, { color: colors.foreground }]}>Who can watch?</Text>
            <View style={styles.visibilityChoices}>
              {([
                ["public", "Everyone"],
                ["followers", "Followers"],
                ["private", "Only me"],
              ] as const).map(([value, label]) => {
                const selected = visibility === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={busy}
                    onPress={() => setVisibility(value)}
                    style={[
                      styles.visibilityChoice,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.accent : colors.card,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.visibilityChoiceText,
                        { color: selected ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.visibilityHint, { color: colors.mutedForeground }]}>
              {visibility === "public"
                ? "Public videos can appear in For You and be shared."
                : visibility === "followers"
                  ? "Only you and people who follow you can watch this video."
                  : "Only you can watch this video. It will not have a public share link."}
            </Text>
            {busy ? (
              <View style={[styles.progressCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={styles.progressTitleRow}>
                  <Text style={[styles.progressTitle, { color: colors.foreground }]}>
                    {stage === "uploading" ? "Uploading video" : "Publishing video"}
                  </Text>
                  <Text style={[styles.progressPercent, { color: colors.primary }]}>
                    {stage === "uploading" ? `${Math.round(progress * 100)}%` : "Almost there"}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${stage === "publishing" ? 100 : Math.round(progress * 100)}%`, backgroundColor: colors.primary },
                    ]}
                  />
                </View>
                <Pressable accessibilityRole="button" onPress={cancelUpload} style={styles.cancelButton}>
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel upload</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.publishButton}>
                <AppButton label="Publish video" onPress={() => void publish()} disabled={!canPublish} />
              </View>
            )}
          </>
        )}

        {error ? (
          <View style={[styles.errorCard, { borderColor: colors.destructive }]}>
            <Feather name="alert-circle" size={17} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : null}

        <View style={[styles.guidance, { borderColor: colors.border }]}>
          <Feather name="shield" size={16} color={colors.primary} />
          <Text style={[styles.guidanceText, { color: colors.mutedForeground }]}>
            Your video uploads directly to private media storage. The visibility you choose is enforced when people request the video.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  pickCard: {
    minHeight: 330,
    borderWidth: 1,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  uploadIcon: { width: 68, height: 68, borderRadius: 23, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  pickTitle: { fontFamily: "Inter_700Bold", fontSize: 21 },
  pickCopy: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 9 },
  pickButton: { borderRadius: 13, paddingHorizontal: 18, paddingVertical: 13, marginTop: 23 },
  pickButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  previewShell: { borderWidth: 1, borderRadius: 19, overflow: "hidden", backgroundColor: "#111111" },
  preview: { width: "100%", aspectRatio: 0.75 },
  fileMeta: { flexDirection: "row", alignItems: "center", paddingVertical: 13, gap: 12 },
  fileName: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  fileDetail: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4 },
  changeText: { fontFamily: "Inter_600SemiBold", fontSize: 12, padding: 8 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 10, marginBottom: 8 },
  captionInput: { minHeight: 104, borderWidth: 1, borderRadius: 14, padding: 14, textAlignVertical: "top", fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 },
  audioInput: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontFamily: "Inter_400Regular", fontSize: 13 },
  visibilityChoices: { flexDirection: "row", gap: 8 },
  visibilityChoice: { minHeight: 42, flex: 1, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  visibilityChoiceText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  visibilityHint: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 8 },
  counter: { alignSelf: "flex-end", fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 7 },
  publishButton: { marginTop: 17 },
  progressCard: { borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 15 },
  progressTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  progressPercent: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  progressTrack: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 12 },
  progressFill: { height: 5, borderRadius: 3 },
  cancelButton: { alignSelf: "center", paddingVertical: 12, paddingHorizontal: 14, marginTop: 4 },
  cancelText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  errorCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 13, padding: 13, marginTop: 14 },
  errorText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  guidance: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderTopWidth: 1, marginTop: 24, paddingTop: 16 },
  guidanceText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 17 },
});
