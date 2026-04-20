import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncSubscriptionFromCloud } from '../utils/subscription';

/**
 * Dispara el sync de suscripcion contra Supabase para el usuario actual.
 * - Fail-open: timeout 5s, sin internet no toca nada.
 * - Si detecta revocacion remota: limpia sub local y redirige a /suscripcion
 *   con un Alert informativo.
 * - Solo corre si hay sesion activa (@estimafacil:logged === 'true').
 */
async function syncAndEnforceSubscription(): Promise<void> {
  try {
    const logged = await AsyncStorage.getItem('@estimafacil:logged');
    if (logged !== 'true') return;

    const userId = await AsyncStorage.getItem('@estimafacil:user_id');
    if (!userId || userId === 'default') return;

    const result = await syncSubscriptionFromCloud(userId, 5000);

    if (result.revoked) {
      // La sub local ya fue borrada por syncSubscriptionFromCloud.
      // Avisar al usuario y mandarlo a la pantalla de suscripcion.
      Alert.alert(
        'Tu codigo fue revocado',
        'Tu suscripcion fue revocada por el administrador. Canjea un codigo nuevo o activa un plan para continuar usando EstimaFacil.',
        [
          {
            text: 'Ir a suscripcion',
            onPress: () => {
              try {
                router.replace('/suscripcion');
              } catch (_) {}
            },
          },
        ],
      );
    }
  } catch (_) {
    // Nunca propagar — fail-open total en boot/foreground.
  }
}

export default function RootLayout() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Sync al montar (startup) y cuando la app vuelve a foreground.
  useEffect(() => {
    // Fire-and-forget: NO bloquea el render del layout.
    syncAndEnforceSubscription();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      // Solo disparar cuando pasamos de background/inactive a active.
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        syncAndEnforceSubscription();
      }
    });

    return () => {
      try {
        subscription.remove();
      } catch (_) {}
    };
  }, []);

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
