/**
 * subscription.ts
 * Sistema de suscripcion y canje de codigos via Supabase (fetch nativo).
 * No usa SDK de Supabase — solo fetch para Free Tier.
 *
 * Todas las claves de AsyncStorage estan prefijadas con userId
 * para que la suscripcion sea por cuenta, no por dispositivo.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyCanjeo, notifyRevocacion } from './notifyCanjeo';

// ── Configuracion Supabase ─────────────────────────────────────────────────
// CONFIGURAR ESTOS VALORES DESPUES DE CREAR EL PROYECTO EN SUPABASE
const SUPABASE_URL = 'https://zolfaqrvgirdnwqypxwd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvbGZhcXJ2Z2lyZG53cXlweHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Njk0MDAsImV4cCI6MjA5MTM0NTQwMH0.UOYB-dHAGJa8ZlP-NZhT6wgLvb-Cv9Yo82TWhO0W3R8';

// ── Storage Keys (prefijadas con userId) ──────────────────────────────────
function keySubExpires(userId: string)   { return `@estimafacil:sub_expires:${userId}`; }
function keySubType(userId: string)      { return `@estimafacil:sub_type:${userId}`; }
function keySubCode(userId: string)      { return `@estimafacil:sub_code:${userId}`; }
function keyTrialStarted(userId: string) { return `@estimafacil:trial_started:${userId}`; }

// ── Consultas locales ──────────────────────────────────────────────────────

export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const expires = await AsyncStorage.getItem(keySubExpires(userId));
  if (!expires) return false;
  return new Date(expires) > new Date();
}

// ── Self-healing: hidratar sub local desde Supabase ────────────────────────

/**
 * Resultado enriquecido de syncSubscriptionFromCloud.
 *   - revoked:   remoto dice que el codigo activo del usuario fue revocado (la
 *                suscripcion local ya fue borrada por esta funcion).
 *   - active:    al terminar el sync, hay suscripcion local vigente.
 *   - timedOut:  la llamada a Supabase excedio el timeout (fail-open).
 *   - offline:   error de red o fetch lanzo excepcion (fail-open).
 */
export interface SyncSubscriptionResult {
  revoked: boolean;
  active: boolean;
  timedOut: boolean;
  offline: boolean;
}

/**
 * Envuelve una promesa con timeout (Hermes-safe, sin AbortController races).
 * Si expira, resuelve con `fallback`.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise
      .then((v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      });
  });
}

/**
 * Consulta Supabase por cualquier codigo activo del usuario (vigente y no revocado)
 * y lo restaura a AsyncStorage si el local no tiene datos.
 *
 * Usar al arrancar la app, al volver a foreground, y antes de verificar si
 * el usuario es Premium (especialmente tras una reinstalacion o tras una
 * revocacion remota via Telegram).
 *
 * Flujo:
 *   1. Si el usuario tiene un codigo activo local y Supabase dice is_revoked=true
 *      → borrar AsyncStorage de suscripcion y reportar revoked:true.
 *   2. Si AsyncStorage local tiene sub valida y coherente → reportar active:true.
 *   3. Si local vacio → buscar en remoto un codigo used_by=userId, !revocado, vigente.
 *      Si existe → restaurar expires/type/code en AsyncStorage.
 *
 * Fail-open: timeout de 5s, errores de red no bloquean. Nunca borra local
 * si no recibio respuesta explicita del servidor.
 */
export async function syncSubscriptionFromCloud(
  userId: string,
  timeoutMs: number = 5000,
): Promise<SyncSubscriptionResult> {
  const defaultResult: SyncSubscriptionResult = {
    revoked: false,
    active: false,
    timedOut: false,
    offline: false,
  };

  if (!userId || userId === 'default') return defaultResult;

  const run = async (): Promise<SyncSubscriptionResult> => {
    const result: SyncSubscriptionResult = {
      revoked: false,
      active: false,
      timedOut: false,
      offline: false,
    };

    try {
      // 1) Revocacion: si existe codigo activo local y fue revocado → limpiar local.
      const wasRevoked = await verifyRevocationAndInvalidate(userId);
      if (wasRevoked) {
        result.revoked = true;
        result.active = false;
        return result;
      }

      // 2) Releer estado local tras la revocacion
      const localExpires = await AsyncStorage.getItem(keySubExpires(userId));
      const localStillValid = (localExpires && new Date(localExpires) > new Date()) || false;
      if (localStillValid) {
        result.active = true;
        return result;
      }

      // 3) Local vacio o expirado → buscar en Supabase
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/activation_codes?used_by=eq.${encodeURIComponent(userId)}&is_used=eq.true&is_revoked=is.false&select=code,type,days,used_at&order=used_at.desc&limit=1`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        },
      );

      if (!res.ok) {
        result.offline = true;
        return result;
      }
      const rows = await res.json();
      if (!rows || rows.length === 0) {
        result.active = false;
        return result;
      }

      const row = rows[0];
      const usedAt = row.used_at ? new Date(row.used_at) : new Date();
      const daysNum = Number(row.days) || 0;
      const expiresAt = new Date(usedAt);
      expiresAt.setDate(expiresAt.getDate() + daysNum);

      // 4) Si todavia esta vigente → hidratar local
      if (expiresAt > new Date()) {
        await AsyncStorage.setItem(keySubExpires(userId), expiresAt.toISOString());
        await AsyncStorage.setItem(keySubType(userId), String((row.type ?? 'premium')));
        await AsyncStorage.setItem(keySubCode(userId), String((row.code ?? '')));
        result.active = true;
        return result;
      }

      return result;
    } catch {
      // Offline o error silencioso — no romper UX, NO borrar local.
      result.offline = true;
      return result;
    }
  };

  const timedOutResult: SyncSubscriptionResult = {
    revoked: false,
    active: false,
    timedOut: true,
    offline: false,
  };

  return withTimeout(run(), timeoutMs, timedOutResult);
}

export async function getDaysRemaining(userId: string): Promise<number> {
  const expires = await AsyncStorage.getItem(keySubExpires(userId));
  if (!expires) return 0;
  const diff = new Date(expires).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export async function getSubscriptionType(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(keySubType(userId));
}

export async function getSubscriptionExpiry(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(keySubExpires(userId));
}

// ── Canjear codigo via Supabase ────────────────────────────────────────────

export async function redeemCode(
  code: string,
  userId: string,
): Promise<{ days: number; type: string }> {
  if (SUPABASE_URL === 'PENDING_CONFIG') {
    throw new Error('Supabase no configurado. Contacta al administrador.');
  }

  // 1. Consultar codigo valido en Supabase (is.false maneja tanto false como NULL)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/activation_codes?code=eq.${encodeURIComponent(code)}&is_used=is.false&select=code,type,days`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  );

  if (!res.ok) throw new Error('Error al validar el codigo. Intenta mas tarde.');

  const data = await res.json();
  if (!data || data.length === 0) throw new Error('Codigo invalido o ya utilizado.');

  const codeData = data[0];

  // 2. Marcar como usado en Supabase
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/activation_codes?code=eq.${encodeURIComponent(code)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        is_used: true,
        used_by: userId,
        used_at: new Date().toISOString(),
      }),
    },
  );

  if (!patchRes.ok) throw new Error('Error al marcar el codigo como usado.');

  // 3. Guardar localmente (claves prefijadas con userId)
  const expires = new Date();
  expires.setDate(expires.getDate() + codeData.days);
  await AsyncStorage.setItem(keySubExpires(userId), expires.toISOString());
  await AsyncStorage.setItem(keySubType(userId), codeData.type);
  await AsyncStorage.setItem(keySubCode(userId), code);

  // 4. Notificar al owner via Telegram (fire-and-forget, no bloquea)
  notifyCanjeo({ code, userId, type: codeData.type, days: codeData.days }).catch(() => {});

  return { days: codeData.days, type: codeData.type };
}

// ── Revocacion de codigos ──────────────────────────────────────────────────

/**
 * Marca un codigo como revocado en Supabase. El proximo
 * verifyRevocationAndInvalidate() del usuario afectado limpiara su sub local.
 */
export async function revokeCode(code: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/activation_codes?code=eq.${encodeURIComponent(code)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
      }),
    },
  );

  if (!res.ok) throw new Error('Error al revocar el codigo.');

  const data = await res.json();
  const usedBy = (data && data[0] && data[0].used_by) || 'desconocido';
  notifyRevocacion(code, usedBy).catch(() => {});
}

/**
 * Verifica si el codigo activo del usuario fue revocado.
 * Si si, limpia la suscripcion local y devuelve true.
 * Llamar al abrir la app o al montar pantallas protegidas.
 */
export async function verifyRevocationAndInvalidate(userId: string): Promise<boolean> {
  const code = await AsyncStorage.getItem(keySubCode(userId));
  if (!code) return false;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/activation_codes?code=eq.${encodeURIComponent(code)}&select=is_revoked`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );
    if (!res.ok) return false;
    const data = await res.json();
    if (data && data[0] && data[0].is_revoked === true) {
      await AsyncStorage.removeItem(keySubExpires(userId));
      await AsyncStorage.removeItem(keySubType(userId));
      await AsyncStorage.removeItem(keySubCode(userId));
      return true;
    }
  } catch {
    // Si falla la red, mantener la sub local para no bloquear offline
  }
  return false;
}

/**
 * Lista todos los codigos canjeados en Supabase (para pantalla admin).
 */
export async function listRedeemedCodes(): Promise<Array<{
  code: string;
  type: string;
  days: number;
  used_by: string;
  used_at: string;
  is_revoked: boolean;
  revoked_at: string | null;
}>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/activation_codes?is_used=eq.true&select=code,type,days,used_by,used_at,is_revoked,revoked_at&order=used_at.desc`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  );
  if (!res.ok) throw new Error('Error al listar codigos canjeados.');
  const data = await res.json();
  return (data || []).map((d: any) => ({
    code: d.code,
    type: d.type,
    days: d.days,
    used_by: d.used_by ?? '',
    used_at: d.used_at ?? '',
    is_revoked: d.is_revoked === true,
    revoked_at: d.revoked_at ?? null,
  }));
}

// ── Trial 15 dias (idempotente) ────────────────────────────────────────────

export async function activateTrial(userId: string): Promise<void> {
  // Solo activar si no hay suscripcion previa para este usuario
  const existing = await AsyncStorage.getItem(keySubExpires(userId));
  if (existing) return;

  const trialExpires = new Date();
  trialExpires.setDate(trialExpires.getDate() + 15);
  await AsyncStorage.setItem(keySubExpires(userId), trialExpires.toISOString());
  await AsyncStorage.setItem(keySubType(userId), 'trial');
  await AsyncStorage.setItem(keyTrialStarted(userId), new Date().toISOString());
}
