/**
 * auth.ts
 * Utilidad de autenticacion local — multi-cuenta por email/telefono.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const USER_ID_KEY = '@estimafacil:user_id';

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
