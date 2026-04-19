/**
 * notifyCanjeo.ts
 * Notificaciones al owner via Telegram Bot cuando se canjea un codigo.
 * Incluye boton inline "REVOCAR" que dispara una Supabase Edge Function.
 *
 * SETUP (una vez):
 *  - Bot Telegram ya creado (@ESTIMAFACILBOT)
 *  - Edge Function `revoke-code` desplegada en Supabase (ver supabase/functions/revoke-code/index.ts)
 *  - REVOKE_SECRET_TOKEN debe coincidir con el env var de la Edge Function
 */

// ── Configuracion ──────────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = '8763972500:AAFeJhlMTNNO1TYvU0BIK2Wlgxy9kRO3Pvc';
const TELEGRAM_CHAT_ID = '8237236486';

// Secret compartido con la Edge Function (Dashboard > Edge Functions > Secrets)
const REVOKE_SECRET_TOKEN = '06f41cac8cf08c934f6f26b85fd7bc85d26d4da48c6abecf';
// URL de la Edge Function desplegada en Supabase
const REVOKE_ENDPOINT = 'https://zolfaqrvgirdnwqypxwd.supabase.co/functions/v1/revoke-code';

interface CanjeoInfo {
  code: string;
  userId: string;
  type: string;
  days: number;
}

function buildRevokeUrl(code: string): string {
  return `${REVOKE_ENDPOINT}?code=${encodeURIComponent(code)}&token=${REVOKE_SECRET_TOKEN}`;
}

export async function notifyCanjeo(info: CanjeoInfo): Promise<void> {
  if (TELEGRAM_BOT_TOKEN === 'PENDING_CONFIG' || TELEGRAM_CHAT_ID === 'PENDING_CONFIG') {
    return;
  }

  const mensaje =
    `CANJEO EstimaFacil\n` +
    `Codigo: ${info.code}\n` +
    `Usuario: ${info.userId}\n` +
    `Plan: ${info.type} (${info.days} dias)\n` +
    `Fecha: ${new Date().toLocaleString('es-MX')}\n\n` +
    `Si el pago no llego, toca el boton de abajo para revocar.`;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: mensaje,
        reply_markup: {
          inline_keyboard: [
            [{ text: `REVOCAR ${info.code}`, url: buildRevokeUrl(info.code) }],
          ],
        },
      }),
    });
  } catch {
    // Silencioso: no bloquear el canjeo si Telegram falla
  }
}

export async function notifyRevocacion(code: string, userId: string): Promise<void> {
  if (TELEGRAM_BOT_TOKEN === 'PENDING_CONFIG' || TELEGRAM_CHAT_ID === 'PENDING_CONFIG') {
    return;
  }

  const mensaje =
    `REVOCACION EstimaFacil\n` +
    `Codigo revocado: ${code}\n` +
    `Usuario afectado: ${userId}\n` +
    `Fecha: ${new Date().toLocaleString('es-MX')}`;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: mensaje,
      }),
    });
  } catch {
    // Silencioso
  }
}
