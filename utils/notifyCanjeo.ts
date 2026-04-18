/**
 * notifyCanjeo.ts
 * Notificaciones al owner via Telegram Bot cuando se canjea un codigo.
 *
 * SETUP (una vez):
 * 1. Abrir Telegram y chatear con @BotFather
 * 2. Enviar: /newbot
 * 3. Seguir instrucciones (nombre + username)
 * 4. Copiar el token HTTP API que entrega @BotFather -> TELEGRAM_BOT_TOKEN
 * 5. Abrir chat con el nuevo bot y enviarle cualquier mensaje
 * 6. Abrir: https://api.telegram.org/bot<TOKEN>/getUpdates
 * 7. Copiar result[0].message.chat.id -> TELEGRAM_CHAT_ID
 * 8. Reemplazar las constantes abajo
 *
 * Si no esta configurado, las notificaciones fallan silenciosamente
 * sin afectar el flujo de canjeo.
 */

// ── Configuracion (reemplazar tras crear bot Telegram) ─────────────────────
const TELEGRAM_BOT_TOKEN = '8763972500:AAFeJhlMTNNO1TYvU0BIK2Wlgxy9kRO3Pvc';
const TELEGRAM_CHAT_ID = '8237236486';

interface CanjeoInfo {
  code: string;
  userId: string;
  type: string;
  days: number;
}

export async function notifyCanjeo(info: CanjeoInfo): Promise<void> {
  // Fire-and-forget: si no esta configurado, salir en silencio
  if (TELEGRAM_BOT_TOKEN === 'PENDING_CONFIG' || TELEGRAM_CHAT_ID === 'PENDING_CONFIG') {
    return;
  }

  const mensaje =
    `CANJEO EstimaFacil\n` +
    `Codigo: ${info.code}\n` +
    `Usuario: ${info.userId}\n` +
    `Plan: ${info.type} (${info.days} dias)\n` +
    `Fecha: ${new Date().toLocaleString('es-MX')}\n\n` +
    `Revocar si el pago no llego:\n` +
    `UPDATE activation_codes SET is_revoked=true, revoked_at=NOW() WHERE code='${info.code}';`;

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
