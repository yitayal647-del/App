import { Feather } from "@expo/vector-icons";
import { getFeed, getGetFeedQueryKey, type VideoItem } from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StateMessage } from "@/components/StateMessage";
import { VideoFeedCard } from "@/components/VideoFeedCard";
import { useColors } from "@/hooks/useColors";

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const feed = useInfiniteQuery({
    queryKey: getGetFeedQueryKey({ limit: 20 }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getFeed({ limit: 20, cursor: pageParam }, { signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
  });
  const [feedHeight, setFeedHeight] = useState(0);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: VideoItem }> }) => {
      setActiveVideoId(viewableItems[0]?.item.id ?? null);
    },
  ).current;
  const videos = feed.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.brand}>
          <Image source={require("../../assets/images/icon.png")} style={styles.logo} />
          <View>
            <Text style={[styles.wordmark, { color: colors.foreground }]}>YOU ALL</Text>
            <Text style={[styles.subhead, { color: colors.mutedForeground }]}>FOR YOU</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Discover creators"
          onPress={() => router.navigate("/(tabs)/discover" as never)}
          style={[styles.headerAction, { borderColor: colors.border }]}
        >
          <Feather name="globe" size={17} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.feed} onLayout={(event) => setFeedHeight(event.nativeEvent.layout.height)}>
        {feed.isLoading ? (
          <StateMessage title="Finding your feed" detail="Loading public videos from YOU ALL." loading />
        ) : feed.isError ? (
          <StateMessage
            title="The feed didn’t load"
            detail="Check your connection and try again."
            icon="wifi-off"
            actionLabel="Try again"
            onAction={() => void feed.refetch()}
          />
        ) : videos.length ? (
          <FlatList
            data={videos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <VideoFeedCard
                video={item}
                height={feedHeight}
                isActive={item.id === activeVideoId}
              />
            )}
            pagingEnabled
            snapToInterval={feedHeight || undefined}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            onEndReached={() => {
              if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
            }}
            onEndReachedThreshold={0.6}
            refreshControl={
              <RefreshControl
                refreshing={feed.isRefetching}
                onRefresh={() => void feed.refetch()}
                tintColor={colors.primary}
              />
            }
            getItemLayout={(_, index) => ({ length: feedHeight, offset: feedHeight * index, index })}
          />
        ) : (
          <StateMessage
            title="The feed is quiet"
            detail="There are no public videos yet. Share your first video or search for creators."
            icon="film"
            actionLabel="Share a video"
            onAction={() => router.navigate("/(tabs)/upload" as never)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    height: 60,
    paddingHorizontal: 19,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 34, height: 34, borderRadius: 11 },
  wordmark: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 2.5 },
  subhead: { fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 2, marginTop: 2 },
  headerAction: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  feed: { flex: 1 },
});
