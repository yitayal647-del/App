import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function IndexRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const colors = useColors();

  if (!isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <Redirect href={isSignedIn ? "/(tabs)" : "/(auth)/sign-in"} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
