import { Feather } from "@expo/vector-icons";
import { useReportUser, type ReportBodyReason } from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "@/components/AppButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";

const reasons: Array<{ value: ReportBodyReason; label: string; description: string }> = [
  { value: "spam", label: "Spam", description: "Scams or repeated unwanted content" },
  { value: "harassment", label: "Harassment", description: "Bullying, threats, or targeted abuse" },
  { value: "impersonation", label: "Impersonation", description: "Pretending to be someone else" },
  { value: "unsafe", label: "Unsafe content", description: "Content that may put someone at risk" },
  { value: "other", label: "Something else", description: "Another concern" },
];

export default function ReportScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const reportedUserId = Array.isArray(params.userId) ? params.userId[0] : params.userId ?? "";
  const [reason, setReason] = useState<ReportBodyReason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const report = useReportUser();

  const submit = async () => {
    if (!reportedUserId || !reason) {
      setError("Choose the reason that best describes the issue.");
      return;
    }
    setError("");
    try {
      await report.mutateAsync({
        data: { reportedUserId, reason, details: details.trim() || undefined },
      });
      router.replace("/(tabs)/profile" as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your report could not be sent.");
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Report account" subtitle="Reports are private" back />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.foreground }]}>
          Help keep YOU ALL safe. Choose a reason; you can add details if they help explain the issue.
        </Text>
        <View style={styles.reasons}>
          {reasons.map((item) => {
            const selected = reason === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setReason(item.value)}
                style={[
                  styles.reason,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.accent : colors.card,
                  },
                ]}
              >
                <View style={styles.reasonCopy}>
                  <Text style={[styles.reasonTitle, { color: colors.foreground }]}>{item.label}</Text>
                  <Text style={[styles.reasonDetail, { color: colors.mutedForeground }]}>{item.description}</Text>
                </View>
                <Feather name={selected ? "check-circle" : "circle"} size={18} color={selected ? colors.primary : colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.label, { color: colors.foreground }]}>Additional details (optional)</Text>
        <TextInput
          value={details}
          onChangeText={setDetails}
          maxLength={1000}
          multiline
          placeholder="Add useful context"
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel="Additional report details"
          style={[styles.details, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
        />
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <View style={styles.submit}>
          <AppButton label="Send report" onPress={() => void submit()} loading={report.isPending} />
        </View>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          Your report is stored for review. Please block the account if you also want to stop messages and remove the follow connection.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 30 },
  intro: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: 16 },
  reasons: { gap: 8 },
  reason: { minHeight: 62, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 10 },
  reasonCopy: { flex: 1, gap: 4 },
  reasonTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  reasonDetail: { fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 20, marginBottom: 8 },
  details: { minHeight: 104, borderWidth: 1, borderRadius: 14, padding: 13, textAlignVertical: "top", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  error: { fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 9 },
  submit: { marginTop: 17 },
  note: { fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 15, marginTop: 14 },
});
