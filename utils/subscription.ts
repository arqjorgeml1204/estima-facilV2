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
