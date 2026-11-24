import { Feather } from "@expo/vector-icons";
import {
  getFollowers,
  getFollowing,
  getGetConversationsQueryKey,
  getGetFollowersQueryKey,
  getGetFollowingQueryKey,
  useFollowProfile,
  useGetProfile,
  useStartConversation,
  type ProfileSummary,
} from "@workspace/api-client-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "@clerk/expo";
import { Avatar } from "@/components/Avatar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StateMessage } from "@/components/StateMessage";
import { useColors } from "@/hooks/useColors";

export default function PeopleListScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    username?: string | string[];
    list?: string | string[];
  }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username ?? "";
  const listType = Array.isArray(params.list) ? params.list[0] : params.list ?? "";
  const isFollowers = listType === "followers";
  const validList = isFollowers || listType === "following";
  const profile = useGetProfile(username, { query: { enabled: Boolean(username && validList) } });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const paramsForList = { limit: 25, q: debouncedSearch || undefined };
  const profileId = profile.data?.id ?? "";
  const followersKey = getGetFollowersQueryKey(profileId, paramsForList);
  const followingKey = getGetFollowingQueryKey(profileId, paramsForList);
  const people = useInfiniteQuery({
    queryKey: isFollowers ? followersKey : followingKey,
    enabled: Boolean(profileId && validList),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      isFollowers
        ? getFollowers(profileId, { ...paramsForList, cursor: pageParam }, { signal })
        : getFollowing(profileId, { ...paramsForList, cursor: pageParam }, { signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const profiles = people.data?.pages.flatMap((page) => page.items) ?? [];
  const title = isFollowers ? "Followers" : "Following";

  if (!validList) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="People" back />
        <StateMessage title="List not found" detail="Choose followers or following from a creator profile." icon="users" />
      </SafeAreaView>
    );
  }
  if (profile.isLoading) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title={title} back />
        <StateMessage title={`Loading ${title.toLowerCase()}`} detail="Fetching this creator’s list." loading />
      </SafeAreaView>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title={title} back />
        <StateMessage title="Creator not found" detail="This profile may have been removed." icon="user-x" actionLabel="Go back" onAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={title} subtitle={`@${username}`} back />
      <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${title.toLowerCase()}`}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={`Search ${title.toLowerCase()}`}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch("")}>
            <Feather name="x-circle" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {people.isLoading ? (
        <StateMessage title={`Loading ${title.toLowerCase()}`} detail="Fetching creator profiles." loading />
      ) : people.isError ? (
        <StateMessage title="People list unavailable" detail="Check your connection and try again." icon="wifi-off" actionLabel="Retry" onAction={() => void people.refetch()} />
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PersonRow
              person={item}
              onUpdated={() => {
                void Promise.all([people.refetch(), profile.refetch()]);
              }}
            />
          )}
          contentContainerStyle={profiles.length ? styles.list : styles.emptyList}
          refreshControl={
            <RefreshControl
              refreshing={people.isRefetching && !people.isFetchingNextPage}
              onRefresh={() => void people.refetch()}
              tintColor={colors.primary}
            />
          }
          onEndReached={() => {
            if (people.hasNextPage && !people.isFetchingNextPage) void people.fetchNextPage();
          }}
          onEndReachedThreshold={0.35}
          ListEmptyComponent={
            <StateMessage
              icon="users"
              title={debouncedSearch ? "No matches" : `No ${title.toLowerCase()} yet`}
              detail={debouncedSearch ? "Try another username or display name." : "This list will fill in as people connect on YOU ALL."}
            />
          }
          ListFooterComponent={
            people.isFetchingNextPage ? (
              <ActivityIndicator style={styles.footer} color={colors.primary} />
            ) : undefined
          }
        />
      )}
    </SafeAreaView>
  );
}

function PersonRow({ person, onUpdated }: { person: ProfileSummary; onUpdated: () => void }) {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const follow = useFollowProfile();
  const startConversation = useStartConversation();
  const [error, setError] = useState("");
  const ownProfile = user?.id === person.id;

  const toggleFollow = async () => {
    setError("");
    try {
      await follow.mutateAsync({ profileId: person.id });
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Follow could not be updated.");
    }
  };

  const message = async () => {
    setError("");
    try {
      const conversation = await startConversation.mutateAsync({ data: { userId: person.id } });
      await queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      router.push(`/messages/${conversation.id}` as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This creator’s privacy settings do not allow a new chat.");
    }
  };

  return (
    <View style={[styles.person, { borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(`/creator/${person.username}` as never)}
        style={styles.personInfo}
      >
        <Avatar name={person.displayName} imageUrl={person.avatarUrl} size={47} />
        <View style={styles.personCopy}>
          <Text numberOfLines={1} style={[styles.personName, { color: colors.foreground }]}>
            {person.displayName}
          </Text>
          <Text numberOfLines={1} style={[styles.personHandle, { color: colors.mutedForeground }]}>
            @{person.username}
          </Text>
        </View>
      </Pressable>
      {!ownProfile ? (
        <View style={styles.rowActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={person.isFollowing ? `Unfollow @${person.username}` : `Follow @${person.username}`}
            disabled={follow.isPending}
            onPress={() => void toggleFollow()}
            style={[
              styles.followButton,
              {
                borderColor: person.isFollowing ? colors.border : colors.primary,
                backgroundColor: person.isFollowing ? "transparent" : colors.primary,
              },
            ]}
          >
            {follow.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.followText, { color: person.isFollowing ? colors.foreground : colors.primaryForeground }]}>
                {person.isFollowing ? "Following" : "Follow"}
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message @${person.username}`}
            disabled={startConversation.isPending}
            onPress={() => void message()}
            style={[styles.messageButton, { borderColor: colors.border }]}
          >
            <Feather name="message-circle" size={16} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={[styles.rowError, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: { minHeight: 47, borderWidth: 1, borderRadius: 13, marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, minHeight: 44, fontFamily: "Inter_400Regular", fontSize: 13 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  person: { minHeight: 74, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  personInfo: { flex: 1, minWidth: 150, flexDirection: "row", alignItems: "center", gap: 10 },
  personCopy: { flex: 1, gap: 4 },
  personName: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  personHandle: { fontFamily: "Inter_400Regular", fontSize: 11 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  followButton: { minWidth: 82, height: 34, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 },
  followText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  messageButton: { width: 35, height: 35, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowError: { width: "100%", fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14, marginLeft: 58 },
  footer: { marginVertical: 18 },
});
