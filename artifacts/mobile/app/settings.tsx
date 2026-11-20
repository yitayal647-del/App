import { Feather } from "@expo/vector-icons";
import { useClerk, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const clerk = useClerk();
  const { user } = useUser();
  const [error, setError] = useState("");

  const signOut = async () => {
    setError("");
    try {
      await clerk.signOut();
      router.replace("/(auth)/sign-in");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "You could not be signed out.");
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

        <Text style={[styles.sectionLabel, styles.preferencesLabel, { color: colors.mutedForeground }]}>
          PREFERENCES
        </Text>
        <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="bell" size={17} color={colors.primary} />
          <View style={styles.infoCopy}>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>Notifications</Text>
            <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>
              In-app activity is available in your inbox. Push preferences are not available yet.
            </Text>
          </View>
        </View>
        <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="lock" size={17} color={colors.primary} />
          <View style={styles.infoCopy}>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>Privacy</Text>
            <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>
              Published videos and profiles are public in this version.
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
  error: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 12 },
  signOut: { borderWidth: 1, borderRadius: 14, minHeight: 50, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22 },
  signOutText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  version: { alignSelf: "center", fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 25 },
});
