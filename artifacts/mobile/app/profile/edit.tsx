import { useGetMyProfile, useUpdateMyProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "@/components/AppButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StateMessage } from "@/components/StateMessage";
import { useColors } from "@/hooks/useColors";

export default function EditProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useGetMyProfile();
  const update = useUpdateMyProfile();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile.data) return;
    setUsername(profile.data.username);
    setDisplayName(profile.data.displayName);
    setBio(profile.data.bio ?? "");
  }, [profile.data]);

  const save = async () => {
    setError("");
    try {
      await update.mutateAsync({
        data: {
          username: username.trim().replace(/^@/, "").toLowerCase(),
          displayName: displayName.trim(),
          bio: bio.trim(),
        },
      });
      await queryClient.invalidateQueries({ queryKey: profile.queryKey });
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your profile could not be updated.");
    }
  };

  if (profile.isLoading) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <StateMessage title="Loading profile" detail="Fetching your account details." loading />
      </SafeAreaView>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Edit profile" back />
        <StateMessage title="Profile unavailable" detail="Try again in a moment." icon="user-x" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Edit profile" subtitle="Update your public details" back />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={60}
            placeholder="How people see you"
            colors={colors}
          />
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            maxLength={24}
            placeholder="yourname"
            colors={colors}
          />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Use 3–24 letters, numbers, or underscores.
          </Text>
          <Field
            label="Bio"
            value={bio}
            onChangeText={setBio}
            maxLength={160}
            multiline
            placeholder="A short introduction"
            colors={colors}
          />
          <Text style={[styles.counter, { color: colors.mutedForeground }]}>{bio.length}/160</Text>
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.saveButton}>
            <AppButton
              label="Save changes"
              onPress={() => void save()}
              loading={update.isPending}
              disabled={
                !displayName.trim() ||
                !/^[a-zA-Z0-9_]{3,24}$/.test(username.trim().replace(/^@/, ""))
              }
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  colors,
  ...props
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.card,
            minHeight: props.multiline ? 112 : 52,
            textAlignVertical: props.multiline ? "top" : "center",
          },
        ]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboard: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 35 },
  field: { marginTop: 19 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 12, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 7 },
  counter: { alignSelf: "flex-end", fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 6 },
  error: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 18 },
  saveButton: { marginTop: 22 },
});
