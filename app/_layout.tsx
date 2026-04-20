import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncSubscriptionFromCloud } from '../utils/subscription';
import {
  notifySupportRequest,
  openWhatsAppSupport,
  SupportPayload,
} from '../utils/supportContact';

// Flag module-level para evitar disparar el Alert de revocacion mas de una vez
// en el mismo ciclo de vida del proceso (ej: AppState foreground repetido o
// multiples llamadas a syncAndEnforceSubscription en paralelo).
let revokedAlertShown = false;

/**
 * Construye el payload de soporte leyendo AsyncStorage.
 * - user_data (JSON): { nombre, email, phone }
 * - user_id: email o 'tel:1234567890'
 * - sub_code:<userId>: ultimo codigo canjeado (el que fue revocado)
 */
async function buildSupportPayload(userId: string): Promise<SupportPayload> {
  let nombre = '';
  let email = '';
  let phone = '';
  try {
    const raw = await AsyncStorage.getItem('@estimafacil:user_data');
    if (raw) {
      const parsed = JSON.parse(raw);
      nombre = (parsed && parsed.nombre) || '';
      email = (parsed && parsed.email) || '';
      phone = (parsed && parsed.phone) || '';
    }
  } catch (_) {
    // JSON invalido → dejar strings vacios.
  }
  let codigoRevocado = '';
  try {
    codigoRevocado = (await AsyncStorage.getItem(`@estimafacil:sub_code:${userId}`)) || '';
  } catch (_) {}
  return { nombre, email, phone, codigoRevocado, userId };
}

/**
 * Muestra el popup de "Pago no validado" con opciones:
 *   - Ver planes → /suscripcion
 *   - Contactar a soporte → Telegram + WhatsApp, luego /suscripcion
 * Fire-and-forget sobre las integraciones externas: nunca bloquean la navegacion.
 */
function showRevokedAlert(userId: string): void {
  Alert.alert(
    'Pago no validado',
    'El pago no se ha validado correctamente, favor de realizarlo o contactar a soporte',
    [
      {
        text: 'Ver planes',
        onPress: () => {
          try {
            router.replace('/suscripcion');
          } catch (_) {}
        },
      },
      {
        text: 'Contactar a soporte',
        onPress: async () => {
          try {
            const payload = await buildSupportPayload(userId);
            // Fire-and-forget: ambas funciones no bloquean la navegacion final.
            notifySupportRequest(payload).catch(() => {});
            openWhatsAppSupport(payload).catch(() => {});
          } catch (_) {
            // Silencioso — garantizamos el redirect aunque falle todo.
          } finally {
            try {
              router.replace('/suscripcion');
            } catch (_) {}
          }
        },
      },
    ],
    {
      // Si el usuario descarta el popup (back button en Android),
      // igual lo mandamos a /suscripcion para no dejarlo en un estado
      // inconsistente (sin sub activa y sin accion tomada).
      onDismiss: () => {
        try {
          router.replace('/suscripcion');
        } catch (_) {}
      },
    },
  );
}

/**
 * Dispara el sync de suscripcion contra Supabase para el usuario actual.
 * - Fail-open: timeout 5s, sin internet no toca nada.
 * - Si detecta revocacion remota: limpia sub local y redirige a /suscripcion
 *   con un Alert informativo que ofrece contactar a soporte.
 * - Solo corre si hay sesion activa (@estimafacil:logged === 'true').
 */
async function syncAndEnforceSubscription(): Promise<void> {
  try {
    const logged = await AsyncStorage.getItem('@estimafacil:logged');
    if (logged !== 'true') return;

    const userId = await AsyncStorage.getItem('@estimafacil:user_id');
    if (!userId || userId === 'default') return;

    const result = await syncSubscriptionFromCloud(userId, 5000);

    if (result.revoked && !revokedAlertShown) {
      revokedAlertShown = true;
      // La sub local ya fue borrada por syncSubscriptionFromCloud.
      showRevokedAlert(userId);
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
