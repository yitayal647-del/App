import { useSignIn } from "@clerk/expo";
import { type Href, Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "@/components/AppButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";

type Step = "email" | "code" | "password" | "complete";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setBusy(true);
    setNotice("");
    try {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) {
        setNotice(created.error.message);
        return;
      }
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) setNotice(sent.error.message);
      else setStep("code");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to send a reset code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (result.error) setNotice(result.error.message);
      else setStep("password");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That code could not be verified.");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (result.error) {
        setNotice(result.error.message);
        return;
      }
      if (signIn.status === "complete") {
        await signIn.finalize({
          navigate: ({ decorateUrl }) => router.replace(decorateUrl("/(tabs)") as Href),
        });
      } else {
        setStep("complete");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The password could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader title="Reset password" back />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.eyebrow, { color: colors.primary }]}>ACCOUNT RECOVERY</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {step === "email"
            ? "Let’s get you back in."
            : step === "code"
              ? "Enter your code."
              : step === "password"
                ? "Choose a new password."
                : "Password updated."}
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {step === "email"
            ? "We’ll send a one-time recovery code to the email on your account."
            : step === "code"
              ? `A recovery code was sent to ${email}.`
              : step === "password"
                ? "Use at least eight characters and keep it private."
                : "You can continue to your account."}
        </Text>

        <View style={[styles.form, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {step === "email" ? (
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              colors={colors}
            />
          ) : null}
          {step === "code" ? (
            <Field
              label="Recovery code"
              value={code}
              onChangeText={setCode}
              placeholder="Enter your code"
              keyboardType="number-pad"
              colors={colors}
            />
          ) : null}
          {step === "password" ? (
            <Field
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              colors={colors}
            />
          ) : null}
          {notice ? (
            <Text style={[styles.notice, { color: colors.destructive }]}>{notice}</Text>
          ) : null}
          {step === "email" ? (
            <AppButton
              label="Send recovery code"
              onPress={sendCode}
              loading={busy || fetchStatus === "fetching"}
              disabled={!email.trim()}
            />
          ) : step === "code" ? (
            <AppButton
              label="Verify code"
              onPress={verifyCode}
              loading={busy || fetchStatus === "fetching"}
              disabled={!code.trim()}
            />
          ) : step === "password" ? (
            <AppButton
              label="Save new password"
              onPress={savePassword}
              loading={busy || fetchStatus === "fetching"}
              disabled={password.length < 8}
            />
          ) : (
            <AppButton label="Continue" onPress={() => router.replace("/(tabs)")} />
          )}
        </View>
        <View style={styles.returnRow}>
          <Text style={[styles.returnText, { color: colors.mutedForeground }]}>
            Remembered it?
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text style={[styles.returnLink, { color: colors.primary }]}>Back to sign in</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
          { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground },
        ]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingBottom: 50 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 2.5 },
  title: { fontFamily: "Inter_700Bold", fontSize: 29, marginTop: 11, lineHeight: 37 },
  description: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22, marginTop: 9, marginBottom: 25 },
  form: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 18 },
  field: { gap: 8 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, fontFamily: "Inter_400Regular", fontSize: 14 },
  notice: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  returnRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 24 },
  returnText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  returnLink: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
