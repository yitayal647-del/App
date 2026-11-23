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
  const [mode, setMode] = useState<"for-you" | "following">("for-you");
  const feed = useInfiniteQuery({
    queryKey: getGetFeedQueryKey({ mode, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getFeed({ mode, limit: 20, cursor: pageParam }, { signal }),
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
            key={mode}
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
            title={mode === "following" ? "Follow a few creators" : "The feed is quiet"}
            detail={
              mode === "following"
                ? "Videos from creators you follow will appear here."
                : "There are no public videos yet. Share your first video or search for creators."
            }
            icon={mode === "following" ? "users" : "film"}
            actionLabel={mode === "following" ? "Discover creators" : "Share a video"}
            onAction={() =>
              router.navigate(
                mode === "following" ? "/(tabs)/discover" as never : "/(tabs)/upload" as never,
              )
            }
          />
        )}
      </View>
      <View pointerEvents="box-none" style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <Image source={require("../../assets/images/icon.png")} style={styles.logo} />
            <Text style={styles.wordmark}>YOU ALL</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            onPress={() => router.navigate("/(tabs)/profile" as never)}
            style={styles.profileButton}
          >
            <Feather name="user" size={17} color="#F3D899" />
          </Pressable>
        </View>
        <View style={styles.tabs}>
          {([
            ["for-you", "For You"],
            ["following", "Following"],
          ] as const).map(([value, title]) => {
            const selected = mode === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setMode(value)}
                style={[styles.feedTab, selected && styles.feedTabActive]}
              >
                <Text style={[styles.feedTabText, selected && styles.feedTabTextActive]}>
                  {title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  feed: { flex: 1 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    paddingHorizontal: 17,
    paddingTop: 5,
    paddingBottom: 8,
  },
  brandRow: { height: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  logo: { width: 30, height: 30, borderRadius: 10 },
  wordmark: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 2.5, textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 8 },
  profileButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  tabs: { flexDirection: "row", alignSelf: "center", gap: 6, marginTop: 8, padding: 3, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.48)" },
  feedTab: { minWidth: 84, minHeight: 29, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  feedTabActive: { backgroundColor: "rgba(216,181,106,0.95)" },
  feedTabText: { color: "rgba(255,255,255,0.8)", fontFamily: "Inter_500Medium", fontSize: 11 },
  feedTabTextActive: { color: "#17130A", fontFamily: "Inter_700Bold" },
});
