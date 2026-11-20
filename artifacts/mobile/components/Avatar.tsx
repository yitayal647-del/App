import { Image, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type Props = {
  name: string;
  imageUrl?: string | null;
  size?: number;
};

export function Avatar({ name, imageUrl, size = 44 }: Props) {
  const colors = useColors();
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <View
      accessibilityLabel={`${name} profile photo`}
      style={[
        styles.shell,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.secondary,
          borderColor: colors.border,
        },
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          resizeMode="cover"
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={[styles.initial, { color: colors.primary, fontSize: size * 0.34 }]}>
          {initials || "•"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  initial: {
    fontFamily: "Inter_600SemiBold",
  },
});
