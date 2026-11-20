import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

type Props = {
  title: string;
  subtitle?: string;
  action?: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void };
  back?: boolean;
};

export function ScreenHeader({ title, subtitle, action, back = false }: Props) {
  const colors = useColors();
  const router = useRouter();

  return (
    <View style={styles.row}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.back, { borderColor: colors.border }]}
        >
          <Feather name="arrow-left" size={19} color={colors.foreground} />
        </Pressable>
      ) : null}
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={[styles.action, { borderColor: colors.border }]}
        >
          <Feather name={action.icon} size={19} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 12,
  },
  copy: { flex: 1 },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -0.4 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  action: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  back: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
