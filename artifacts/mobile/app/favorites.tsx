import {
  getFavorites,
  getGetFavoritesQueryKey,
} from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StateMessage } from "@/components/StateMessage";
import { VideoPreviewTile } from "@/components/VideoPreviewTile";
import { useColors } from "@/hooks/useColors";

export default function FavoritesScreen() {
  const colors = useColors();
  const router = useRouter();
  const favorites = useInfiniteQuery({
    queryKey: getGetFavoritesQueryKey({ limit: 12 }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getFavorites({ limit: 12, cursor: pageParam }, { signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const videos = favorites.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Saved videos" subtitle="Favorites you can return to" back />
      {favorites.isLoading ? (
        <StateMessage title="Loading saved videos" detail="Fetching your favorites." loading />
      ) : favorites.isError ? (
        <StateMessage
          title="Saved videos unavailable"
          detail="Check your connection and try again."
          icon="wifi-off"
          actionLabel="Retry"
          onAction={() => void favorites.refetch()}
        />
      ) : videos.length ? (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => <VideoPreviewTile video={item} />}
          refreshControl={
            <RefreshControl
              refreshing={favorites.isRefetching && !favorites.isFetchingNextPage}
              onRefresh={() => void favorites.refetch()}
              tintColor={colors.primary}
            />
          }
          onEndReached={() => {
            if (favorites.hasNextPage && !favorites.isFetchingNextPage) {
              void favorites.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
        />
      ) : (
        <StateMessage
          icon="bookmark"
          title="No saved videos"
          detail="Tap the bookmark on a video to keep it here."
          actionLabel="Browse videos"
          onAction={() => router.replace("/(tabs)" as never)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  grid: { paddingHorizontal: 18, paddingBottom: 24 },
  row: { gap: 10, marginBottom: 10 },
});
