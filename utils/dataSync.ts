/**
 * dataSync.ts
 * Backup/restore de datos de usuario a Supabase (tabla `user_data_backups`).
 *
 * Objetivo: tras desinstalar+reinstalar la app, el usuario pueda recuperar
 * sus proyectos, conceptos, estimaciones, detalles, evidencias y croquis
 * haciendo login con el mismo email.
 *
 * Estrategia:
 *   - backupToCloud: serializa TODO lo que tiene el usuario en SQLite como
 *     JSON y lo upsertea en `user_data_backups` con email como clave.
 *   - restoreFromCloud: si la BD local esta vacia Y existe snapshot remoto,
 *     descarga e hidrata SQLite. Si hay datos locales, NO sobrescribe para
 *     evitar perder cambios no sincronizados.
 *
 * Hermes-safe: sin lookahead/lookbehind, sin named groups, hooks ignorados
 * (no es componente). Networking es fire-and-forget desde los triggers.
 */

import { getDb } from '../db/database';

// ── Supabase config (misma que auth.ts / subscription.ts) ─────────────────
const SUPABASE_URL = 'https://zolfaqrvgirdnwqypxwd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvbGZhcXJ2Z2lyZG53cXlweHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Njk0MDAsImV4cCI6MjA5MTM0NTQwMH0.UOYB-dHAGJa8ZlP-NZhT6wgLvb-Cv9Yo82TWhO0W3R8';

// ── Snapshot shape ────────────────────────────────────────────────────────

interface UserSnapshot {
  version: number;
  exported_at: string;
  user_id: string;
  empresas: any[];
  desarrolladoras: any[];
  proyectos: any[];
  conceptos: any[];
  estimaciones: any[];
  detalles: any[];
  evidencias: any[];
  croquis: any[];
}

const SNAPSHOT_VERSION = 1;

// ── Helpers ───────────────────────────────────────────────────────────────

function normEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

async function getAllRowsOfUser(userId: string): Promise<UserSnapshot> {
  const db = getDb();

  // Proyectos del usuario (o sin user_id para backwards compat con datos viejos)
  const proyectos = await db.getAllAsync<any>(
    'SELECT * FROM proyecto WHERE user_id=? OR user_id IS NULL OR user_id=\'\'',
    [userId],
  );

  const empresas = await db.getAllAsync<any>(
    'SELECT * FROM empresa WHERE user_id=? OR user_id IS NULL OR user_id=\'\'',
    [userId],
  );

  const desarrolladoras = await db.getAllAsync<any>('SELECT * FROM desarrolladora');

  let conceptos: any[] = [];
  let estimaciones: any[] = [];
  let detalles: any[] = [];
  let evidencias: any[] = [];
  let croquis: any[] = [];

  if (proyectos.length > 0) {
    const proyectoIds = proyectos.map((p) => p.id);
    const placeholders = proyectoIds.map(() => '?').join(',');

    conceptos = await db.getAllAsync<any>(
      `SELECT * FROM concepto WHERE proyecto_id IN (${placeholders})`,
      proyectoIds,
    );

    estimaciones = await db.getAllAsync<any>(
      `SELECT * FROM estimacion WHERE proyecto_id IN (${placeholders})`,
      proyectoIds,
    );

    if (estimaciones.length > 0) {
      const estIds = estimaciones.map((e) => e.id);
      const estPh = estIds.map(() => '?').join(',');

      detalles = await db.getAllAsync<any>(
        `SELECT * FROM detalle_estimacion WHERE estimacion_id IN (${estPh})`,
        estIds,
      );
      evidencias = await db.getAllAsync<any>(
        `SELECT * FROM evidencia WHERE estimacion_id IN (${estPh})`,
        estIds,
      );
      croquis = await db.getAllAsync<any>(
        `SELECT * FROM croquis WHERE estimacion_id IN (${estPh})`,
        estIds,
      );
    }
  }

  return {
    version: SNAPSHOT_VERSION,
    exported_at: new Date().toISOString(),
    user_id: userId,
    empresas,
    desarrolladoras,
    proyectos,
    conceptos,
    estimaciones,
    detalles,
    evidencias,
    croquis,
  };
}

async function isLocalDbEmptyForUser(userId: string): Promise<boolean> {
  try {
    const db = getDb();
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) as n FROM proyecto WHERE user_id=? OR user_id IS NULL OR user_id=\'\'',
      [userId],
    );
    const n = (row?.n ?? 0);
    return n === 0;
  } catch {
    return true;
  }
}

// ── API: Backup ───────────────────────────────────────────────────────────

/**
 * Serializa TODA la data del usuario desde SQLite y hace upsert
 * en la tabla `user_data_backups` de Supabase.
 *
 * Idempotente: sobrescribe snapshot previo del mismo email.
 * Fire-and-forget recomendado: llamar con .catch(()=>{}) para no bloquear UI.
 */
export async function backupToCloud(email: string): Promise<boolean> {
  const userId = normEmail(email);
  if (!userId || userId === 'default') return false;

  try {
    const snapshot = await getAllRowsOfUser(userId);

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_data_backups?on_conflict=user_email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          user_email: userId,
          snapshot,
          updated_at: new Date().toISOString(),
        }),
      },
    );

    if (!res.ok) {
      if (__DEV__) console.warn('[DATA-SYNC] backup fallo:', res.status);
      return false;
    }
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[DATA-SYNC] backup excepcion:', e);
    return false;
  }
}

// ── API: Restore ──────────────────────────────────────────────────────────

/**
 * Si la BD local esta vacia para este usuario Y existe un snapshot remoto,
 * descarga y repuebla SQLite. Si ya hay datos locales, NO sobrescribe.
 *
 * Llamar desde el flujo de login justo despues de autenticar, antes de
 * mostrar la pantalla principal.
 */
export async function restoreFromCloud(email: string): Promise<boolean> {
  const userId = normEmail(email);
  if (!userId || userId === 'default') return false;

  try {
    // No sobrescribir si la BD local ya tiene datos para este usuario
    const empty = await isLocalDbEmptyForUser(userId);
    if (!empty) return false;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_data_backups?user_email=eq.${encodeURIComponent(userId)}&select=snapshot,updated_at&order=updated_at.desc&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );
    if (!res.ok) return false;

    const rows = await res.json();
    if (!rows || rows.length === 0) return false;

    const snapshot: UserSnapshot = rows[0].snapshot;
    if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) {
      if (__DEV__) console.warn('[DATA-SYNC] snapshot version incompatible:', snapshot?.version);
      return false;
    }

    await hydrateDbFromSnapshot(snapshot);
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[DATA-SYNC] restore excepcion:', e);
    return false;
  }
}

// ── Hidratacion ───────────────────────────────────────────────────────────

/**
 * Inserta filas del snapshot en SQLite conservando los IDs originales.
 * Se asume que la BD local esta vacia para este usuario (validado antes de llamar).
 */
async function hydrateDbFromSnapshot(s: UserSnapshot): Promise<void> {
  const db = getDb();

  // Helper insert dinamico preservando claves → columnas
  const insertRow = async (table: string, row: any) => {
    const keys = Object.keys(row);
    if (keys.length === 0) return;
    const cols = keys.join(',');
    const placeholders = keys.map(() => '?').join(',');
    const values = keys.map((k) => row[k]);
    try {
      await db.runAsync(
        `INSERT OR IGNORE INTO ${table} (${cols}) VALUES (${placeholders})`,
        values,
      );
    } catch (e) {
      // Silencioso: una fila corrupta no debe romper la restauracion completa
      if (__DEV__) console.warn(`[DATA-SYNC] insert ${table} fallo:`, e);
    }
  };

  // Orden: padres antes que hijos para respetar FK
  for (const row of (s.desarrolladoras ?? [])) await insertRow('desarrolladora', row);
  for (const row of (s.empresas ?? []))        await insertRow('empresa', row);
  for (const row of (s.proyectos ?? []))       await insertRow('proyecto', row);
  for (const row of (s.conceptos ?? []))       await insertRow('concepto', row);
  for (const row of (s.estimaciones ?? []))    await insertRow('estimacion', row);
  for (const row of (s.detalles ?? []))        await insertRow('detalle_estimacion', row);
  for (const row of (s.evidencias ?? []))      await insertRow('evidencia', row);
  for (const row of (s.croquis ?? []))         await insertRow('croquis', row);
}

// ── Debounced backup trigger ──────────────────────────────────────────────

/**
 * Debounce manual (sin lodash): agrupa multiples requestBackup() consecutivos
 * y ejecuta un solo backup tras `delayMs` de inactividad.
 *
 * Uso: en los puntos de guardado (guardar estimacion, insertar detalle, etc.)
 *     requestCloudBackup(email).
 *
 * Todas las fallas son silenciosas — NUNCA bloquea la UX.
 */
let backupTimer: ReturnType<typeof setTimeout> | null = null;
let pendingEmail: string | null = null;

export function requestCloudBackup(email: string, delayMs: number = 2500): void {
  const userId = normEmail(email);
  if (!userId || userId === 'default') return;

  pendingEmail = userId;

  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }

  backupTimer = setTimeout(() => {
    const emailToBackup = pendingEmail;
    pendingEmail = null;
    backupTimer = null;
    if (emailToBackup) {
      // fire-and-forget con try/catch implicito en la promise
      backupToCloud(emailToBackup).catch(() => {});
    }
  }, delayMs);
}
