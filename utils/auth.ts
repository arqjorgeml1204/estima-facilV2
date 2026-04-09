/**
 * auth.ts
 * Utilidad de autenticacion local — multi-cuenta por email/telefono.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_ID_KEY = '@estimafacil:user_id';

/**
 * Retorna el user_id almacenado localmente.
 * Si no hay sesion activa retorna 'default' (backwards compat).
 */
export async function getCurrentUserId(): Promise<string> {
  const uid = await AsyncStorage.getItem(USER_ID_KEY);
  return uid ?? 'default';
}
