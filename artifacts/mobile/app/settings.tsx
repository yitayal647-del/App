import { Feather } from "@expo/vector-icons";
import { useClerk, useUser } from "@clerk/expo";
import {
  getGetBlockedUsersQueryKey,
  getGetMessagingSettingsQueryKey,
  useGetBlockedUsers,
  useGetMessagingSettings,
  useUnblockUser,
  useUpdateMessagingSettings,
  type MessagingSettingsAllowFrom,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StateMessage } from "@/components/StateMessage";
import { useColors } from "@/hooks/useColors";

const messagePrivacyOptions: Array<{
  value: MessagingSettingsAllowFrom;
  title: string;
  detail: string;
}> = [
  { value: "followers", title: "Followers", detail: "People who follow you can start a chat." },
  { value: "following", title: "People you follow", detail: "Creators you follow can start a chat." },
  { value: "mutual", title: "Mutual follows", detail: "Only people who follow each other can start a chat." },
  { value: "everyone", title: "Everyone", detail: "Any YOU ALL member can start a chat." },
  { value: "nobody", title: "Nobody", detail: "No one can start a new chat with you." },
];

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clerk = useClerk();
  const { user } = useUser();
  const [error, setError] = useState("");
  const settings = useGetMessagingSettings();
  const blockedUsers = useGetBlockedUsers();
  const updateSettings = useUpdateMessagingSettings();
  const unblockUser = useUnblockUser();

  const signOut = async () => {
    setError("");
    try {
      await clerk.signOut();
      router.replace("/(auth)/sign-in");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "You could not be signed out.");
    }
  };

  const setPrivacy = async (allowFrom: MessagingSettingsAllowFrom) => {
    setError("");
    try {
      const result = await updateSettings.mutateAsync({ data: { allowFrom } });
      queryClient.setQueryData(getGetMessagingSettingsQueryKey(), result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message privacy could not be updated.");
    }
  };

  const unblock = async (id: string) => {
    setError("");
    try {
      await unblockUser.mutateAsync({ userId: id });
      await queryClient.invalidateQueries({ queryKey: getGetBlockedUsersQueryKey() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This account could not be unblocked.");
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Settings" subtitle="Account and app controls" back />
      <View style={styles.content}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACCOUNT</Text>
        <View style={[styles.accountCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={[styles.accountIcon, { backgroundColor: colors.accent }]}>
            <Feather name="user" size={19} color={colors.primary} />
          </View>
          <View style={styles.accountCopy}>
            <Text style={[styles.accountName, { color: colors.foreground }]}>
              {user?.fullName || user?.username || "YOU ALL member"}
            </Text>
            <Text style={[styles.accountEmail, { color: colors.mutedForeground }]}>
              {user?.primaryEmailAddress?.emailAddress ?? "Signed-in account"}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, styles.preferencesLabel, { color: colors.mutedForeground }]}>PRIVACY</Text>
        <View style={[styles.privacyIntro, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="lock" size={17} color={colors.primary} />
          <View style={styles.infoCopy}>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>Who can start a conversation?</Text>
            <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>
              This applies to new and ongoing messages. Blocking someone disables messages both ways.
            </Text>
          </View>
        </View>
        {settings.isLoading ? (
          <View style={styles.settingsLoading}>
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading privacy settings…</Text>
          </View>
        ) : settings.isError ? (
          <Pressable onPress={() => void settings.refetch()} style={[styles.retryRow, { borderColor: colors.border }]}>
            <Feather name="refresh-cw" size={14} color={colors.primary} />
            <Text style={[styles.retryText, { color: colors.foreground }]}>Retry privacy settings</Text>
          </Pressable>
        ) : (
          <View style={styles.privacyOptions}>
            {messagePrivacyOptions.map((option) => {
              const selected = settings.data?.allowFrom === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  disabled={updateSettings.isPending}
                  onPress={() => void setPrivacy(option.value)}
                  style={[
                    styles.privacyOption,
                    { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <View style={styles.privacyCopy}>
                    <Text style={[styles.infoTitle, { color: colors.foreground }]}>{option.title}</Text>
                    <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>{option.detail}</Text>
                  </View>
                  <Feather
                    name={selected ? "check-circle" : "circle"}
                    size={18}
                    color={selected ? colors.primary : colors.mutedForeground}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={[styles.sectionLabel, styles.blockedHeading, { color: colors.mutedForeground }]}>BLOCKED ACCOUNTS</Text>
        {blockedUsers.isLoading ? (
          <View style={styles.settingsLoading}>
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading blocked accounts…</Text>
          </View>
        ) : blockedUsers.isError ? (
          <Pressable onPress={() => void blockedUsers.refetch()} style={[styles.retryRow, { borderColor: colors.border }]}>
            <Feather name="refresh-cw" size={14} color={colors.primary} />
            <Text style={[styles.retryText, { color: colors.foreground }]}>Retry blocked accounts</Text>
          </Pressable>
        ) : blockedUsers.data?.items.length ? (
          <View style={styles.blockedList}>
            {blockedUsers.data.items.map((person) => (
              <View key={person.id} style={[styles.blockedRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Avatar name={person.displayName} imageUrl={person.avatarUrl} size={40} />
                <View style={styles.accountCopy}>
                  <Text style={[styles.infoTitle, { color: colors.foreground }]}>{person.displayName}</Text>
                  <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>@{person.username}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={unblockUser.isPending}
                  onPress={() => void unblock(person.id)}
                  style={[styles.unblockButton, { borderColor: colors.border }]}
                >
                  <Text style={[styles.unblockText, { color: colors.primary }]}>Unblock</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="check" size={17} color={colors.primary} />
            <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>
              You haven’t blocked anyone.
            </Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, styles.preferencesLabel, { color: colors.mutedForeground }]}>PREFERENCES</Text>
        <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="bell" size={17} color={colors.primary} />
          <View style={styles.infoCopy}>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>Notifications</Text>
            <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>
              In-app activity is available in your inbox. Push preferences are not available yet.
            </Text>
          </View>
        </View>
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={[styles.signOut, { borderColor: colors.border }]}
        >
          <Feather name="log-out" size={17} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out</Text>
        </Pressable>
        <Text style={[styles.version, { color: colors.mutedForeground }]}>YOU ALL · Early access</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 9 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 1.6, marginBottom: 10 },
  accountCard: { borderWidth: 1, borderRadius: 17, minHeight: 78, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  accountIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  accountCopy: { flex: 1, gap: 5 },
  accountName: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  accountEmail: { fontFamily: "Inter_400Regular", fontSize: 11 },
  preferencesLabel: { marginTop: 27 },
  infoCard: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 9 },
  infoCopy: { flex: 1 },
  infoTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  infoBody: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 17, marginTop: 5 },
  privacyIntro: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 9 },
  privacyOptions: { gap: 8 },
  privacyOption: { minHeight: 64, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  privacyCopy: { flex: 1 },
  blockedHeading: { marginTop: 24 },
  blockedList: { gap: 8 },
  blockedRow: { minHeight: 60, borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  unblockButton: { minHeight: 34, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  unblockText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  settingsLoading: { minHeight: 48, justifyContent: "center" },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 11 },
  retryRow: { minHeight: 42, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  retryText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  error: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 12 },
  signOut: { borderWidth: 1, borderRadius: 14, minHeight: 50, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22 },
  signOutText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  version: { alignSelf: "center", fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 25 },
});
