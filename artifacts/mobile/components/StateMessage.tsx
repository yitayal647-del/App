import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { AppButton } from "./AppButton";

type Props = {
  title: string;
  detail: string;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

export function StateMessage({
  title,
  detail,
  icon = "film",
  loading = false,
  actionLabel,
  onAction,
}: Props) {
  const colors = useColors();

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconShell, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" />
        ) : (
          <Feather name={icon} size={26} color={colors.primary} />
        )}
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.detail, { color: colors.mutedForeground }]}>{detail}</Text>
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <AppButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 36,
  },
  iconShell: {
    width: 64,
    height: 64,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 19,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    textAlign: "center",
  },
  detail: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: "center",
  },
  action: { marginTop: 20, width: "100%" },
});
