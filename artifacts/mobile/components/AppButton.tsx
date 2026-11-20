import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useColors } from "@/hooks/useColors";

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "quiet";
};

export function AppButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
}: Props) {
  const colors = useColors();
  const muted = variant === "quiet";
  const primary = variant === "primary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary
            ? colors.primary
            : muted
              ? "transparent"
              : colors.secondary,
          borderColor: primary ? colors.primary : colors.border,
          opacity: disabled || loading ? 0.55 : pressed ? 0.82 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.primaryForeground : colors.primary} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: primary ? colors.primaryForeground : colors.foreground },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    letterSpacing: 0.2,
  },
});
