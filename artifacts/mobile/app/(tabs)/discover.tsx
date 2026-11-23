import { Feather } from "@expo/vector-icons";
import { useSearch } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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

export default function DiscoverScreen() {
  const colors = useColors();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim();
  const results = useSearch(
    { q: normalizedQuery },
    { query: { enabled: normalizedQuery.length > 0, staleTime: 20_000 } },
  );

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Discover" subtitle="Find creators and video captions" />
      <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search YOU ALL"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.input, { color: colors.foreground }]}
          accessibilityLabel="Search creators and video captions"
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")}>
            <Feather name="x-circle" size={17} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {!normalizedQuery ? (
        <StateMessage
          icon="compass"
          title="Find your next favorite"
          detail="Search real creator profiles and captions from videos shared on YOU ALL."
        />
      ) : results.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Searching…</Text>
        </View>
      ) : results.isError ? (
        <StateMessage
          icon="alert-circle"
          title="Search isn’t available"
          detail="Try again in a moment."
          actionLabel="Retry"
          onAction={() => void results.refetch()}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CREATORS</Text>
          {results.data?.users.length ? (
            results.data.users.map((creator) => (
              <Pressable
                key={creator.id}
                accessibilityRole="link"
                onPress={() => router.push(`/creator/${creator.username}` as never)}
                style={[styles.creatorRow, { borderBottomColor: colors.border }]}
              >
                <Avatar name={creator.displayName} imageUrl={creator.avatarUrl} size={48} />
                <View style={styles.creatorCopy}>
                  <Text style={[styles.creatorName, { color: colors.foreground }]}>
                    {creator.displayName}
                  </Text>
                  <Text style={[styles.handle, { color: colors.mutedForeground }]}>
                    @{creator.username}
                  </Text>
                </View>
                <Feather name="arrow-up-right" size={18} color={colors.primary} />
              </Pressable>
            ))
          ) : (
            <Text style={[styles.noResults, { color: colors.mutedForeground }]}>
              No creator profiles match this search.
            </Text>
          )}

          <Text style={[styles.sectionLabel, styles.videoHeading, { color: colors.mutedForeground }]}>
            VIDEO CAPTIONS
          </Text>
          {results.data?.videos.length ? (
            results.data.videos.map((video) => (
              <Pressable
                key={video.id}
                accessibilityRole="link"
                onPress={() => router.push(`/video/${video.id}` as never)}
                style={[styles.videoRow, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <View style={[styles.videoIcon, { backgroundColor: colors.accent }]}>
                  <Feather name="play" size={16} color={colors.primary} />
                </View>
                <View style={styles.videoCopy}>
                  <Text numberOfLines={2} style={[styles.videoCaption, { color: colors.foreground }]}>
                    {video.caption || "Untitled video"}
                  </Text>
                  <Text style={[styles.handle, { color: colors.mutedForeground }]}>
                    @{video.creator.username}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            ))
          ) : (
            <Text style={[styles.noResults, { color: colors.mutedForeground }]}>
              No video captions match this search.
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchBox: {
    minHeight: 50,
    marginHorizontal: 20,
    marginTop: 7,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: { flex: 1, minHeight: 48, fontFamily: "Inter_400Regular", fontSize: 14 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  results: { paddingHorizontal: 20, paddingBottom: 30 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 1.7, marginTop: 12, marginBottom: 9 },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  creatorCopy: { flex: 1, gap: 4 },
  creatorName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  handle: { fontFamily: "Inter_400Regular", fontSize: 12 },
  noResults: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, paddingVertical: 10 },
  videoHeading: { marginTop: 27 },
  videoRow: { minHeight: 76, borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 },
  videoIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  videoCopy: { flex: 1, gap: 5 },
  videoCaption: { fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 18 },
});
