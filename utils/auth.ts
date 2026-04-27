/**
 * auth.ts
 * Autenticación híbrida: SQLite local + Supabase remoto.
 * Supabase persiste usuarios entre instalaciones.
 * SQLite es cache local rápida.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  getUsuarioByUserId,
  updateUserPassword,
  initDatabase,
} from '../db/database';

const USER_ID_KEY = '@estimafacil:user_id';

// ── Supabase config (misma que subscription.ts) ──
// NOTA SEGURIDAD: la `anon` key de Supabase está pensada para clientes públicos
// y por sí sola no concede acceso privilegiado siempre que las RLS estén
// configuradas. Aún así, para permitir rotación sin recompilar leemos primero
// de variables de entorno (EAS Secrets / Expo public env) y solo caemos al
// valor histórico si no hay env. NUNCA loguear esta key en producción.
const SUPABASE_URL =
  (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ||
  'https://zolfaqrvgirdnwqypxwd.supabase.co';
const SUPABASE_ANON_KEY =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvbGZhcXJ2Z2lyZG53cXlweHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Njk0MDAsImV4cCI6MjA5MTM0NTQwMH0.UOYB-dHAGJa8ZlP-NZhT6wgLvb-Cv9Yo82TWhO0W3R8';

// Regex de email reforzado (V12 audit). Requiere TLD ≥ 2 letras.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Lista canónica de claves AsyncStorage que `clearSessionState()` debe
 * limpiar al cerrar sesión. Importante: si se agregan nuevas claves de
 * sesión/suscripción, registrarlas aquí (ver tasks/lessons.md).
 */
export const SESSION_BASE_KEYS = [
  '@estimafacil:logged',
  '@estimafacil:email',
  '@estimafacil:remember',
  '@estimafacil:firstTime',
  '@estimafacil:user_id',
  // legacy
  'obra',
  'frente',
];

/**
 * Devuelve las claves AsyncStorage prefijadas por userId que también deben
 * limpiarse en logout (suscripción local + trial), para que el siguiente
 * login con cualquier email parta de cero y el access gate no quede mintiendo
 * "trial consumido" o "código activo" de la sesión anterior.
 */
export function buildPerUserSessionKeys(userId: string): string[] {
  const safe = (userId || '').trim();
  if (!safe || safe === 'default') return [];
  return [
    `@estimafacil:sub_expires:${safe}`,
    `@estimafacil:sub_type:${safe}`,
    `@estimafacil:sub_code:${safe}`,
    `@estimafacil:trial_started:${safe}`,
  ];
}

/**
 * Limpia el estado de sesión del dispositivo de forma exhaustiva.
 * Lee el userId actual ANTES de borrar la clave base (de lo contrario
 * `buildPerUserSessionKeys` recibe undefined → no limpia las claves
 * prefijadas y el siguiente login queda bloqueado por "trial consumido").
 */
export async function clearSessionState(): Promise<void> {
  let currentUserId = '';
  try {
    currentUserId = (await AsyncStorage.getItem(USER_ID_KEY)) ?? '';
  } catch {
    // ignorar — si no podemos leer, igual seguimos limpiando lo posible
  }
  const perUserKeys = buildPerUserSessionKeys(currentUserId);
  await AsyncStorage.multiRemove([...SESSION_BASE_KEYS, ...perUserKeys]);
}

/**
 * Retorna el user_id almacenado localmente.
 * Si no hay sesion activa retorna 'default' (backwards compat).
 */
export async function getCurrentUserId(): Promise<string> {
  const uid = await AsyncStorage.getItem(USER_ID_KEY);
  return uid ?? 'default';
}

/**
 * Genera un salt aleatorio de 32 caracteres (Hermes-safe, sin crypto.getRandomValues).
 */
export function generateSalt(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let salt = '';
  for (let i = 0; i < 32; i++) {
    salt += chars[Math.floor(Math.random() * chars.length)];
  }
  return salt;
}

/**
 * Hashea una contraseña con SHA-256 usando el salt dado.
 * @returns hex string del hash
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    salt + password,
  );
}

// ── Supabase Remote Auth ─────────────────────────────────────────────────────

interface SupabaseUser {
  user_id: string;
  nombre: string;
  password_hash: string;
  salt: string;
}

/**
 * Registra usuario en Supabase (tabla `usuarios`).
 * Si ya existe, no hace nada (UPSERT por user_id).
 */
export async function registerUserRemote(
  userId: string,
  nombre: string,
  passwordHash: string,
  salt: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          user_id: userId,
          nombre,
          password_hash: passwordHash,
          salt,
        }),
      },
    );
    if (!res.ok) {
      if (__DEV__) console.warn('[AUTH-REMOTE] Error registrando usuario:', res.status);
      return false;
    }
    if (__DEV__) console.log('[AUTH-REMOTE] Usuario registrado/actualizado');
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[AUTH-REMOTE] Excepción al registrar:', e);
    return false;
  }
}

/**
 * Busca un usuario en Supabase por user_id.
 * Retorna null si no existe.
 */
export async function getUserRemote(userId: string): Promise<SupabaseUser | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?user_id=eq.${encodeURIComponent(userId)}&select=user_id,nombre,password_hash,salt`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );
    if (!res.ok) {
      if (__DEV__) console.warn('[AUTH-REMOTE] Error buscando usuario:', res.status);
      return null;
    }
    const rows: SupabaseUser[] = await res.json();
    return rows.length > 0 ? rows[0] : null;
  } catch (e) {
    if (__DEV__) console.warn('[AUTH-REMOTE] Excepción al buscar usuario:', e);
    return null;
  }
}

// ── Password recovery (local) ────────────────────────────────────────────────

/**
 * Valida que un string sea un email "razonable" según EMAIL_REGEX.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Busca un usuario por email (case-insensitive). Retorna user de SQLite local
 * o, como fallback, lo que esté en Supabase (para casos de reinstalación).
 * NO expone password al caller — el caller solo necesita saber si existe.
 */
export async function findUserByEmail(email: string): Promise<SupabaseUser | null> {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!isValidEmail(normalized)) return null;
  await initDatabase();
  // 1) SQLite local
  const local = await getUsuarioByUserId(normalized);
  if (local) return local;
  // 2) Fallback Supabase (no bloqueante: si timeout, retornamos null)
  try {
    const remote = await getUserRemote(normalized);
    return remote;
  } catch {
    return null;
  }
}

/**
 * Resetea la contraseña por email (sin enviar correo: solo flujo local con
 * confirmación previa de existencia). Genera nuevo salt + hash, actualiza
 * SQLite y dispara registerUserRemote como fire-and-forget para sincronizar
 * con Supabase. Retorna { ok, error? }.
 */
export async function resetPasswordByEmail(
  email: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!isValidEmail(normalized)) {
    return { ok: false, error: 'Correo inválido.' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  try {
    await initDatabase();
    // Verifica que el usuario existe (local o remoto).
    let usuario = await getUsuarioByUserId(normalized);
    if (!usuario) {
      const remote = await getUserRemote(normalized);
      if (remote) {
        // Hidratar local antes de actualizar password (SQL UPDATE necesita fila).
        try {
          // import dinámico para evitar ciclo
          const { createUsuario } = await import('../db/database');
          await createUsuario(
            remote.user_id,
            remote.nombre,
            remote.password_hash,
            remote.salt,
          );
        } catch {
          // ya existía: ignorar
        }
        usuario = remote;
      }
    }
    if (!usuario) {
      return { ok: false, error: 'No hay cuenta registrada con ese correo.' };
    }

    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);
    const updated = await updateUserPassword(normalized, newHash, newSalt);
    if (!updated) {
      return { ok: false, error: 'No se pudo actualizar la contraseña.' };
    }
    // Sync remoto: fire-and-forget; no bloquear el reset si falla la red.
    registerUserRemote(normalized, usuario.nombre, newHash, newSalt).catch(() => {});
    return { ok: true };
  } catch (e: any) {
    if (__DEV__) console.warn('[AUTH] resetPasswordByEmail error:', e?.message ?? e);
    return { ok: false, error: 'Error interno. Intenta de nuevo.' };
  }
}
