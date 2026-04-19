// Supabase Edge Function: revoke-code
// Deploy via Supabase Dashboard > Edge Functions > Deploy new function
// Name: revoke-code
//
// Required env var (Dashboard > Project Settings > Edge Functions > Secrets):
//   REVOKE_SECRET_TOKEN = <secret-token>   (el mismo que está en utils/notifyCanjeo.ts)
//
// Usage (desde Telegram button): GET https://<PROJECT>.supabase.co/functions/v1/revoke-code?code=XXX&token=YYY

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REVOKE_SECRET_TOKEN = Deno.env.get('REVOKE_SECRET_TOKEN')!;

function htmlResponse(status: number, title: string, body: string, color = '#003d9b') {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f8f9fb; margin:0; padding:24px; color:#191c1e; }
    .card { max-width:420px; margin:40px auto; background:#ffffff; border-radius:12px; padding:24px; box-shadow:0 4px 16px rgba(0,0,0,0.06); border-top:6px solid ${color}; }
    h1 { font-size:20px; margin:0 0 8px; color:${color}; }
    p { font-size:14px; color:#5a5e6b; margin:4px 0; }
    code { background:#f0f2f7; padding:2px 6px; border-radius:4px; font-size:13px; }
  </style>
</head>
<body><div class="card"><h1>${title}</h1>${body}</div></body>
</html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const token = url.searchParams.get('token');

    if (!token || token !== REVOKE_SECRET_TOKEN) {
      return htmlResponse(401, 'Acceso denegado', '<p>Token inválido.</p>', '#D32F2F');
    }
    if (!code) {
      return htmlResponse(400, 'Parámetro faltante', '<p>Falta el código a revocar.</p>', '#D32F2F');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { data: existing, error: selErr } = await supabase
      .from('activation_codes')
      .select('code, is_revoked, used_by')
      .eq('code', code)
      .single();

    if (selErr || !existing) {
      return htmlResponse(404, 'Código no encontrado', `<p>El código <code>${code}</code> no existe.</p>`, '#D32F2F');
    }
    if (existing.is_revoked) {
      return htmlResponse(200, 'Ya estaba revocado', `<p>El código <code>${code}</code> ya había sido revocado previamente.</p><p>Usuario: <code>${existing.used_by ?? '-'}</code></p>`, '#E68200');
    }

    const { error: updErr } = await supabase
      .from('activation_codes')
      .update({ is_revoked: true, revoked_at: new Date().toISOString() })
      .eq('code', code);

    if (updErr) {
      return htmlResponse(500, 'Error', `<p>No se pudo revocar: ${updErr.message}</p>`, '#D32F2F');
    }

    return htmlResponse(
      200,
      'Código revocado',
      `<p>El código <code>${code}</code> ha sido revocado.</p><p>Usuario afectado: <code>${existing.used_by ?? '-'}</code></p><p>La suscripción se invalidará la próxima vez que el usuario abra la app.</p>`,
      '#1A7A3C',
    );
  } catch (e) {
    return htmlResponse(500, 'Error interno', `<p>${(e as Error).message}</p>`, '#D32F2F');
  }
});
