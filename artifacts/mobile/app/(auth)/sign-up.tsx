import { useAuth, useSignUp } from "@clerk/expo";
import { type Href, Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
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
import { useColors } from "@/hooks/useColors";

export default function SignUpScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const busy = isSubmitting || fetchStatus === "fetching";
  const isVerifying =
    isCodeSent ||
    (signUp.status === "missing_requirements" &&
      signUp.unverifiedFields.includes("email_address") &&
      signUp.missingFields.length === 0);

  const finishSignUp = async () => {
    await signUp.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setNotice("Finish the account check in your email, then sign in again.");
          return;
        }
        router.replace(decorateUrl("/(tabs)") as Href);
      },
    });
  };

  const submitCredentials = async () => {
    setIsSubmitting(true);
    setNotice("");
    try {
      const result = await signUp.password({
        emailAddress: email.trim(),
        password,
      });
      if (result.error) {
        setNotice(result.error.message);
        return;
      }
      const verification = await signUp.verifications.sendEmailCode();
      if (verification.error) setNotice(verification.error.message);
      else setIsCodeSent(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create the account right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyEmail = async () => {
    setIsSubmitting(true);
    setNotice("");
    try {
      const result = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (result.error) setNotice(result.error.message);
      else if (signUp.status === "complete") await finishSignUp();
      else setNotice("The account still needs another verification step.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That code could not be verified.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSignedIn) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Image source={require("../../assets/images/icon.png")} style={styles.logo} />
          <Text style={[styles.wordmark, { color: colors.foreground }]}>YOU ALL</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Your voice. Your people. Your world.
          </Text>
        </View>

        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            {isVerifying ? "EMAIL VERIFICATION" : "JOIN THE COMMUNITY"}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {isVerifying ? "Check your inbox" : "Create your account"}
          </Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {isVerifying
              ? `Enter the verification code sent to ${email}.`
              : "A real account gives you a profile, a feed, and a place to share."}
          </Text>

          {isVerifying ? (
            <>
              <Field
                label="Email verification code"
                value={code}
                onChangeText={setCode}
                placeholder="Enter your code"
                keyboardType="number-pad"
                colors={colors}
              />
              {errors.fields.code?.message ? (
                <Text style={[styles.fieldError, { color: colors.destructive }]}>
                  {errors.fields.code.message}
                </Text>
              ) : null}
              {notice ? <Text style={[styles.notice, { color: colors.destructive }]}>{notice}</Text> : null}
              <View style={styles.buttonGap}>
                <AppButton
                  label="Verify email"
                  onPress={verifyEmail}
                  loading={busy}
                  disabled={!code.trim()}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  setNotice("");
                  const result = await signUp.verifications.sendEmailCode();
                  if (result.error) setNotice(result.error.message);
                  else setNotice("A new code was sent.");
                }}
                style={styles.resend}
              >
                <Text style={[styles.resendText, { color: colors.primary }]}>Send a new code</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Field
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                colors={colors}
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                colors={colors}
              />
              {errors.fields.emailAddress?.message ? (
                <Text style={[styles.fieldError, { color: colors.destructive }]}>
                  {errors.fields.emailAddress.message}
                </Text>
              ) : null}
              {errors.fields.password?.message ? (
                <Text style={[styles.fieldError, { color: colors.destructive }]}>
                  {errors.fields.password.message}
                </Text>
              ) : null}
              {notice ? <Text style={[styles.notice, { color: colors.destructive }]}>{notice}</Text> : null}
              <View style={styles.buttonGap}>
                <AppButton
                  label="Create account"
                  onPress={submitCredentials}
                  loading={busy}
                  disabled={!email.trim() || password.length < 8}
                />
              </View>
            </>
          )}

          <View style={styles.linkRow}>
            <Text style={[styles.linkIntro, { color: colors.mutedForeground }]}>
              Already have an account?
            </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable>
                <Text style={[styles.linkText, { color: colors.primary }]}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </View>
        <View nativeID="clerk-captcha" />
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
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 40, paddingBottom: 32 },
  brand: { alignItems: "center", marginBottom: 26 },
  logo: { width: 70, height: 70, borderRadius: 22 },
  wordmark: { fontFamily: "Inter_700Bold", fontSize: 19, letterSpacing: 5, marginTop: 16 },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 7 },
  card: { borderWidth: 1, borderRadius: 24, padding: 23 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 2.3 },
  title: { fontFamily: "Inter_700Bold", fontSize: 26, marginTop: 8 },
  description: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, marginTop: 6 },
  field: { marginTop: 20 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 8 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, fontFamily: "Inter_400Regular", fontSize: 14 },
  fieldError: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 7 },
  notice: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 14 },
  buttonGap: { marginTop: 22 },
  resend: { alignSelf: "center", padding: 13 },
  resendText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  linkRow: { borderTopWidth: 1, borderTopColor: "#2A2823", marginTop: 22, paddingTop: 19, flexDirection: "row", justifyContent: "center", gap: 6 },
  linkIntro: { fontFamily: "Inter_400Regular", fontSize: 12 },
  linkText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
