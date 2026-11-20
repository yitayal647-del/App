import { Feather } from "@expo/vector-icons";
import { useAuth, useSignIn } from "@clerk/expo";
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

export default function SignInScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { isSignedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const needsCode =
    signIn.status === "needs_client_trust" ||
    (signIn.status === "needs_second_factor" && notice.startsWith("code:"));
  const busy = isSubmitting || fetchStatus === "fetching";

  const finishSignIn = async () => {
    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setNotice("Finish the account check in your email, then sign in again.");
          return;
        }
        router.replace(decorateUrl("/(tabs)") as Href);
      },
    });
  };

  const submitPassword = async () => {
    setNotice("");
    setIsSubmitting(true);
    try {
      const result = await signIn.password({
        emailAddress: email.trim(),
        password,
      });
      if (result.error) {
        setNotice(result.error.message);
      } else if (signIn.status === "complete") {
        await finishSignIn();
      } else if (
        signIn.status === "needs_client_trust" ||
        signIn.status === "needs_second_factor"
      ) {
        const emailFactor = signIn.supportedSecondFactors.find(
          (factor) => factor.strategy === "email_code",
        );
        if (emailFactor) {
          const verification = await signIn.mfa.sendEmailCode();
          if (verification.error) setNotice(verification.error.message);
          else setNotice("code: A verification code was sent to your email.");
        } else {
          setNotice("This account requires a verification method not available in this version.");
        }
      } else {
        setNotice("Sign-in needs another account check. Try again or contact support.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to sign in right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyCode = async () => {
    setIsSubmitting(true);
    setNotice("");
    try {
      const result = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (result.error) setNotice(result.error.message);
      else if (signIn.status === "complete") await finishSignIn();
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
            The world, in your frame.
          </Text>
        </View>

        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            {needsCode ? "SECURE CHECK" : "WELCOME BACK"}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {needsCode ? "Verify it’s you" : "Sign in"}
          </Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {needsCode
              ? "Enter the code sent to your email to finish signing in."
              : "Your people and your next story are waiting."}
          </Text>

          {needsCode ? (
            <Field
              label="Email verification code"
              value={code}
              onChangeText={setCode}
              placeholder="Enter your code"
              keyboardType="number-pad"
              colors={colors}
            />
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
                placeholder="Your password"
                secureTextEntry
                colors={colors}
              />
              {errors.fields.identifier?.message ? (
                <Text style={[styles.fieldError, { color: colors.destructive }]}>
                  {errors.fields.identifier.message}
                </Text>
              ) : null}
              {errors.fields.password?.message ? (
                <Text style={[styles.fieldError, { color: colors.destructive }]}>
                  {errors.fields.password.message}
                </Text>
              ) : null}
              <Link href="/(auth)/forgot-password" asChild>
                <Pressable style={styles.forgotLink}>
                  <Text style={[styles.forgotText, { color: colors.primary }]}>
                    Forgot password?
                  </Text>
                </Pressable>
              </Link>
            </>
          )}

          {notice ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.notice,
                { color: notice.startsWith("code:") ? colors.accentForeground : colors.destructive },
              ]}
            >
              {notice.replace(/^code:\s*/, "")}
            </Text>
          ) : null}
          {needsCode ? (
            <>
              <AppButton label="Verify and continue" onPress={verifyCode} loading={busy} disabled={!code.trim()} />
              <Pressable
                accessibilityRole="button"
                onPress={() => signIn.mfa.sendEmailCode()}
                style={styles.resend}
              >
                <Text style={[styles.resendText, { color: colors.mutedForeground }]}>
                  Send a new code
                </Text>
              </Pressable>
            </>
          ) : (
            <AppButton
              label="Continue"
              onPress={submitPassword}
              loading={busy}
              disabled={!email.trim() || !password}
            />
          )}
          {needsCode ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNotice("");
                setCode("");
                signIn.reset();
              }}
              style={styles.resend}
            >
              <Text style={[styles.resendText, { color: colors.mutedForeground }]}>
                Use a different account
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.bottomLink}>
            <Text style={[styles.bottomText, { color: colors.mutedForeground }]}>
              New to YOU ALL?
            </Text>
            <Link href="/(auth)/sign-up" asChild>
              <Pressable>
                <Text style={[styles.linkText, { color: colors.primary }]}>Create account</Text>
              </Pressable>
            </Link>
          </View>
        </View>
        {Platform.OS === "web" ? (
          <View style={styles.webNote}>
            <Feather name="lock" size={13} color={colors.mutedForeground} />
            <Text style={[styles.webNoteText, { color: colors.mutedForeground }]}>
              Your account is protected by Clerk.
            </Text>
          </View>
        ) : null}
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
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 45,
    paddingBottom: 34,
  },
  brand: { alignItems: "center", marginBottom: 28 },
  logo: { width: 72, height: 72, borderRadius: 23 },
  wordmark: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    letterSpacing: 5,
    marginTop: 17,
  },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 7 },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 23,
  },
  eyebrow: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 2.5,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, marginTop: 8 },
  description: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, marginTop: 6 },
  field: { marginTop: 20 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 8 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 15,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  fieldError: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 7 },
  forgotLink: { alignSelf: "flex-end", marginTop: 12, marginBottom: 20 },
  forgotText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  notice: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 16, marginBottom: 14 },
  resend: { alignSelf: "center", padding: 13 },
  resendText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  bottomLink: {
    borderTopWidth: 1,
    borderTopColor: "#2A2823",
    marginTop: 22,
    paddingTop: 19,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  bottomText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  linkText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  webNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 22 },
  webNoteText: { fontFamily: "Inter_400Regular", fontSize: 11 },
});
