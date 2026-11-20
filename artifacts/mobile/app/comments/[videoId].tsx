import { useCreateComment, useGetComments } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StateMessage } from "@/components/StateMessage";
import { useColors } from "@/hooks/useColors";

export default function CommentsScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ videoId?: string | string[] }>();
  const videoId = Array.isArray(params.videoId) ? params.videoId[0] : params.videoId ?? "";
  const queryClient = useQueryClient();
  const router = useRouter();
  const comments = useGetComments(videoId, { limit: 50 }, { query: { enabled: !!videoId } });
  const createComment = useCreateComment();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    const value = body.trim();
    if (!value || !videoId) return;
    setError("");
    try {
      await createComment.mutateAsync({ videoId, data: { body: value } });
      setBody("");
      await queryClient.invalidateQueries({ queryKey: comments.queryKey });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your comment could not be sent.");
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Comments" subtitle="Join the conversation" back />
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        {comments.isLoading ? (
          <StateMessage title="Loading comments" detail="Fetching the conversation." loading />
        ) : comments.isError ? (
          <StateMessage
            title="Comments aren’t available"
            detail="Try again in a moment."
            icon="message-circle"
            actionLabel="Retry"
            onAction={() => void comments.refetch()}
          />
        ) : comments.data?.items.length ? (
          <ScrollView
            contentContainerStyle={styles.commentList}
            keyboardShouldPersistTaps="handled"
          >
            {comments.data.items.map((comment) => (
              <View key={comment.id} style={styles.commentRow}>
                <Avatar
                  name={comment.author.displayName}
                  imageUrl={comment.author.avatarUrl}
                  size={40}
                />
                <View style={[styles.commentCard, { backgroundColor: colors.card }]}>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push(`/creator/${comment.author.username}` as never)}
                  >
                    <Text style={[styles.author, { color: colors.foreground }]}>
                      {comment.author.displayName}
                    </Text>
                  </Pressable>
                  <Text style={[styles.commentBody, { color: colors.foreground }]}>
                    {comment.body}
                  </Text>
                  <Text style={[styles.time, { color: colors.mutedForeground }]}>
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <StateMessage
            title="Start the conversation"
            detail="No one has commented on this video yet."
            icon="message-circle"
          />
        )}
        <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.composerRow}>
            <TextInput
              value={body}
              onChangeText={setBody}
              maxLength={1000}
              multiline
              placeholder="Write a comment"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
              ]}
              accessibilityLabel="Write a comment"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              accessibilityState={{ disabled: !body.trim() || createComment.isPending }}
              disabled={!body.trim() || createComment.isPending}
              onPress={() => void submit()}
              style={[
                styles.send,
                { backgroundColor: body.trim() ? colors.primary : colors.secondary },
              ]}
            >
              {createComment.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text style={[styles.sendIcon, { color: body.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
                  ↑
                </Text>
              )}
            </Pressable>
          </View>
          <Text style={[styles.characterCount, { color: colors.mutedForeground }]}>
            {body.length}/1000
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  commentList: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 20, gap: 12 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  commentCard: { flex: 1, borderRadius: 15, padding: 12 },
  author: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  commentBody: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, marginTop: 4 },
  time: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 7 },
  composer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 9 },
  input: { flex: 1, minHeight: 46, maxHeight: 115, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 13, textAlignVertical: "center" },
  send: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sendIcon: { fontFamily: "Inter_700Bold", fontSize: 22, marginTop: -2 },
  characterCount: { alignSelf: "flex-end", fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 5, marginRight: 50 },
  error: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginBottom: 8 },
});
