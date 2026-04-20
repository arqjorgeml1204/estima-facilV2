// Supabase Edge Function: revoke-code
// Deploy via Supabase Dashboard > Edge Functions > Deploy new function
// Name: revoke-code
//
// Required env var (Dashboard > Project Settings > Edge Functions > Secrets):
//   REVOKE_SECRET_TOKEN = <secret-token>   (el mismo que esta en utils/notifyCanjeo.ts)
//
// Usage (desde Telegram button): GET https://<PROJECT>.supabase.co/functions/v1/revoke-code?code=XXX&token=YYY
//
// IMPORTANTE: Supabase gateway sobreescribe el Content-Type a text/plain y descarta headers custom.
// Por eso devolvemos TEXTO PLANO ASCII (sin acentos) en vez de HTML. Funciona universalmente
// en cualquier navegador in-app (Telegram, WhatsApp, etc.) sin problemas de encoding.

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REVOKE_SECRET_TOKEN = Deno.env.get('REVOKE_SECRET_TOKEN')!;

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const token = url.searchParams.get('token');

    if (!token || token !== REVOKE_SECRET_TOKEN) {
      return textResponse(
        401,
        'ACCESO DENEGADO\n\nToken invalido.',
      );
    }
    if (!code) {
      return textResponse(
        400,
        'PARAMETRO FALTANTE\n\nFalta el codigo a revocar.',
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { data: existing, error: selErr } = await supabase
      .from('activation_codes')
      .select('code, is_revoked, used_by')
      .eq('code', code)
      .single();

    if (selErr || !existing) {
      return textResponse(
        404,
        `CODIGO NO ENCONTRADO\n\nEl codigo ${code} no existe.`,
      );
    }
    if (existing.is_revoked) {
      return textResponse(
        200,
        `YA ESTABA REVOCADO\n\nEl codigo ${code} ya habia sido revocado previamente.\nUsuario: ${existing.used_by ?? '-'}`,
      );
    }

    const { error: updErr } = await supabase
      .from('activation_codes')
      .update({ is_revoked: true, revoked_at: new Date().toISOString() })
      .eq('code', code);

    if (updErr) {
      return textResponse(
        500,
        `ERROR\n\nNo se pudo revocar: ${updErr.message}`,
      );
    }

    return textResponse(
      200,
      `CODIGO REVOCADO\n\nCodigo: ${code}\nUsuario afectado: ${existing.used_by ?? '-'}\n\nLa suscripcion se invalidara la proxima vez que el usuario abra la app o la ponga en primer plano.`,
    );
  } catch (e) {
    return textResponse(
      500,
      `ERROR INTERNO\n\n${(e as Error).message}`,
    );
  }
});
