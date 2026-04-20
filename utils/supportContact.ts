/**
 * supportContact.ts
 * Helpers para contactar soporte cuando una suscripcion es revocada
 * o el pago no fue validado.
 *
 * Dos canales:
 *   1) notifySupportRequest — envia mensaje al admin via Telegram Bot API
 *      (fire-and-forget, no bloquea la UI si falla).
 *   2) openWhatsAppSupport — abre WhatsApp del dispositivo con mensaje
 *      pre-llenado hacia el admin.
 *
 * PENDIENTE: configurar ADMIN_WHATSAPP_PHONE con el numero real en formato
 * internacional (ej: +521234567890). Mientras sea 'PENDING_CONFIG', la
 * funcion openWhatsAppSupport es no-op y solo se enviara la notificacion
 * por Telegram.
 *
 * Hermes-safe: sin lookahead/lookbehind/named groups.
 */

import { Linking } from 'react-native';

// ── Configuracion ──────────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = '8763972500:AAFeJhlMTNNO1TYvU0BIK2Wlgxy9kRO3Pvc';
const TELEGRAM_CHAT_ID = '8237236486';

// TODO PM: Configurar numero admin en formato internacional, ej: +521234567890
const ADMIN_WHATSAPP_PHONE = 'PENDING_CONFIG';

// ── Tipos ──────────────────────────────────────────────────────────────────
export interface SupportPayload {
  nombre: string;
  email: string;
  phone: string;
  codigoRevocado: string;
  userId: string;
}

// ── Telegram: notificar al admin ──────────────────────────────────────────
/**
 * Envia mensaje al admin via Telegram Bot API.
 * Fire-and-forget: no bloquea la UI si falla.
 */
export async function notifySupportRequest(payload: SupportPayload): Promise<void> {
  const msg =
    `Inconveniente de pago\n` +
    `Usuario: ${payload.nombre || '(sin nombre)'}\n` +
    `Email: ${payload.email || '(sin email)'}\n` +
    `Telefono: ${payload.phone || '(sin telefono)'}\n` +
    `User ID: ${payload.userId}\n` +
    `Codigo revocado: ${payload.codigoRevocado || '(desconocido)'}\n` +
    `Fecha: ${new Date().toLocaleString('es-MX')}`;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg }),
    });
  } catch {
    // Silencioso — no bloquear UX.
  }
}

// ── WhatsApp: abrir chat con mensaje pre-llenado ──────────────────────────
/**
 * Abre WhatsApp en el dispositivo con mensaje pre-llenado hacia el admin.
 * No-op si ADMIN_WHATSAPP_PHONE === 'PENDING_CONFIG'.
 */
export async function openWhatsAppSupport(payload: SupportPayload): Promise<void> {
  if (ADMIN_WHATSAPP_PHONE === 'PENDING_CONFIG') {
    return;
  }
  const msg =
    `Hola, presento un inconveniente con el pago de EstimaFacil.\n\n` +
    `Nombre: ${payload.nombre || '(sin nombre)'}\n` +
    `Email: ${payload.email || '(sin email)'}\n` +
    `Telefono: ${payload.phone || '(sin telefono)'}\n` +
    `Codigo revocado: ${payload.codigoRevocado || '(desconocido)'}`;
  // Hermes-safe: character class simple, sin lookahead.
  const phoneDigits = ADMIN_WHATSAPP_PHONE.replace(/[^0-9]/g, '');
  const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`;
  try {
    await Linking.openURL(url);
  } catch {
    // Silencioso — no bloquear UX.
  }
}
