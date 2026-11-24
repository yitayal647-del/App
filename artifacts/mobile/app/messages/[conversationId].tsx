import { Feather } from "@expo/vector-icons";
import {
  getConversationMessages,
  getGetConversationMessagesQueryKey,
  getGetConversationsQueryKey,
  useGetConversations,
  useSendMessage,
  type MessageItem,
} from "@workspace/api-client-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  type ScrollViewInstance,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StateMessage } from "@/components/StateMessage";
import { useColors } from "@/hooks/useColors";

export default function ConversationScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const conversationId = Array.isArray(params.conversationId)
    ? params.conversationId[0] ?? ""
    : params.conversationId ?? "";
  const conversations = useGetConversations();
  const conversation = conversations.data?.items.find((item) => item.id === conversationId);
  const [messageText, setMessageText] = useState("");
  const [sendError, setSendError] = useState("");
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const shouldScrollToEnd = useRef(true);
  const lastMessageId = useRef<string | null>(null);
  const sendMutation = useSendMessage();
  const messages = useInfiniteQuery({
    queryKey: getGetConversationMessagesQueryKey(conversationId, { limit: 50 }),
    enabled: Boolean(conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getConversationMessages(conversationId, { limit: 50, cursor: pageParam }, { signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 4_000,
    refetchIntervalInBackground: true,
  });
  const allMessages = (messages.data?.pages.flatMap((page) => page.items) ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id.localeCompare(b.id),
    );

  const newestMessageId = allMessages.at(-1)?.id ?? null;
  useEffect(() => {
    lastMessageId.current = null;
    shouldScrollToEnd.current = true;
  }, [conversationId]);
  useEffect(() => {
    if (newestMessageId && newestMessageId !== lastMessageId.current) {
      lastMessageId.current = newestMessageId;
      shouldScrollToEnd.current = true;
    }
  }, [newestMessageId]);

  const send = async () => {
    const body = messageText.trim();
    if (!body || sendMutation.isPending) return;
    setSendError("");
    shouldScrollToEnd.current = true;
    try {
      await sendMutation.mutateAsync({ conversationId, data: { body } });
      setMessageText("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getGetConversationMessagesQueryKey(conversationId),
        }),
        queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() }),
      ]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Message not sent. Your draft is still here.");
    }
  };

  const openProfile = () => {
    if (conversation?.otherUser.username) {
      router.push(`/creator/${conversation.otherUser.username}` as never);
    }
  };

  if (messages.isLoading) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Messages" back />
        <StateMessage title="Opening conversation" detail="Loading your messages." loading />
      </SafeAreaView>
    );
  }
  if (messages.isError) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title={conversation?.otherUser.displayName ?? "Messages"} back />
        <StateMessage
          title="Conversation unavailable"
          detail="You may no longer have access to this conversation."
          icon="lock"
          actionLabel="Retry"
          onAction={() => void messages.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={conversation?.otherUser.displayName ?? "Conversation"}
        subtitle={conversation ? `@${conversation.otherUser.username}` : "Private messages"}
        back
        action={conversation ? { label: "Open creator profile", icon: "user", onPress: openProfile } : undefined}
      />
      <View style={styles.thread}>
        {messages.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            disabled={messages.isFetchingNextPage}
            onPress={() => void messages.fetchNextPage()}
            style={[styles.loadOlder, { borderColor: colors.border }]}
          >
            {messages.isFetchingNextPage ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.loadOlderText, { color: colors.primary }]}>Load earlier messages</Text>
            )}
          </Pressable>
        ) : null}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (shouldScrollToEnd.current) {
              scrollRef.current?.scrollToEnd({ animated: false });
              shouldScrollToEnd.current = false;
            }
          }}
        >
          {allMessages.map((item) => (
            <MessageBubble key={item.id} message={item} currentUserId={user?.id} />
          ))}
          {!allMessages.length ? (
            <View style={styles.empty}>
              <Avatar
                name={conversation?.otherUser.displayName ?? "Creator"}
                imageUrl={conversation?.otherUser.avatarUrl}
                size={60}
              />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Start the conversation
              </Text>
              <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
                Messages are private to the people in this chat.
              </Text>
            </View>
          ) : null}
        </ScrollView>
        <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TextInput
            value={messageText}
            onChangeText={setMessageText}
            maxLength={2000}
            multiline
            placeholder="Write a message"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Write a message"
            style={[styles.input, { color: colors.foreground }]}
            onSubmitEditing={() => void send()}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!messageText.trim() || sendMutation.isPending}
            onPress={() => void send()}
            style={[
              styles.sendButton,
              { backgroundColor: messageText.trim() ? colors.primary : colors.secondary },
            ]}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="arrow-up" size={19} color={messageText.trim() ? colors.primaryForeground : colors.mutedForeground} />
            )}
          </Pressable>
        </View>
        {sendError ? (
          <Text style={[styles.sendError, { color: colors.destructive }]}>{sendError}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function MessageBubble({ message, currentUserId }: { message: MessageItem; currentUserId?: string }) {
  const colors = useColors();
  const isMine = currentUserId ? message.sender.id === currentUserId : false;
  return (
    <View style={[styles.messageRow, isMine && styles.myMessageRow]}>
      {!isMine ? (
        <Avatar name={message.sender.displayName} imageUrl={message.sender.avatarUrl} size={28} />
      ) : null}
      <View
        style={[
          styles.bubble,
          isMine
            ? { backgroundColor: colors.primary, borderBottomRightRadius: 5 }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 5 },
        ]}
      >
        <Text style={[styles.messageText, { color: isMine ? colors.primaryForeground : colors.foreground }]}>
          {message.body}
        </Text>
        <View style={styles.messageMeta}>
          <Text style={[styles.messageTime, { color: isMine ? "rgba(25,18,7,0.68)" : colors.mutedForeground }]}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </Text>
          {isMine ? (
            <Text style={[styles.messageTime, { color: "rgba(25,18,7,0.68)" }]}>
              {message.isRead ? "Seen" : "Sent"}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  thread: { flex: 1, paddingHorizontal: 16, paddingBottom: 12 },
  loadOlder: { alignSelf: "center", minHeight: 36, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", marginVertical: 8 },
  loadOlderText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  messageList: { paddingVertical: 12, flexGrow: 1, justifyContent: "flex-end", gap: 11 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 7, maxWidth: "88%" },
  myMessageRow: { alignSelf: "flex-end" },
  bubble: { maxWidth: "100%", borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  messageText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  messageMeta: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  messageTime: { fontFamily: "Inter_400Regular", fontSize: 9 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 25 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, marginTop: 7 },
  emptyCopy: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", lineHeight: 18 },
  composer: { minHeight: 54, maxHeight: 130, borderWidth: 1, borderRadius: 18, paddingLeft: 13, paddingRight: 6, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: { flex: 1, minHeight: 48, maxHeight: 120, paddingVertical: 13, fontFamily: "Inter_400Regular", fontSize: 13, textAlignVertical: "center" },
  sendButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  sendError: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16, marginTop: 7, marginHorizontal: 4 },
});
