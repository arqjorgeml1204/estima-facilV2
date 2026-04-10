import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="proyecto" />
          <Stack.Screen name="estimacion" />
          <Stack.Screen name="pdf" />
          <Stack.Screen name="suscripcion" />
          <Stack.Screen name="terminos" />
          <Stack.Screen name="privacidad" />
          <Stack.Screen name="evidencia" />
          <Stack.Screen name="croquis" />
        </Stack>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
