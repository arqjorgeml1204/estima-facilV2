/**
 * auth.ts
 * Autenticación híbrida: SQLite local + Supabase remoto.
 * Supabase persiste usuarios entre instalaciones.
 * SQLite es cache local rápida.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const USER_ID_KEY = '@estimafacil:user_id';

// ── Supabase config (misma que subscription.ts) ──
const SUPABASE_URL = 'https://zolfaqrvgirdnwqypxwd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvbGZhcXJ2Z2lyZG53cXlweHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Njk0MDAsImV4cCI6MjA5MTM0NTQwMH0.UOYB-dHAGJa8ZlP-NZhT6wgLvb-Cv9Yo82TWhO0W3R8';

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
      console.warn('[AUTH-REMOTE] Error registrando usuario:', res.status, await res.text());
      return false;
    }
    console.log('[AUTH-REMOTE] Usuario registrado/actualizado:', userId);
    return true;
  } catch (e) {
    console.warn('[AUTH-REMOTE] Excepción al registrar:', e);
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
      console.warn('[AUTH-REMOTE] Error buscando usuario:', res.status);
      return null;
    }
    const rows: SupabaseUser[] = await res.json();
    return rows.length > 0 ? rows[0] : null;
  } catch (e) {
    console.warn('[AUTH-REMOTE] Excepción al buscar usuario:', e);
    return null;
  }
}
