/**
 * database.ts
 * Inicialización y operaciones principales de SQLite.
 */

import * as SQLite from 'expo-sqlite';
import { MIGRATIONS, DB_NAME } from './schema';
import type { ContratoExtraido } from '../services/pdfExtractor';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await database.execAsync(MIGRATIONS);
      db = database;
      return database;
    })();
  }
  return initPromise;
}

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('DB no inicializada. Llama initDatabase() primero.');
  return db;
}

// ─── Empresa ──────────────────────────────────────────────────────────────────

export async function getEmpresa() {
  const database = getDb();
  return database.getFirstAsync<{ id: number; nombre: string; rfc: string; logo_uri: string }>(
    'SELECT * FROM empresa LIMIT 1'
  );
}

export async function upsertEmpresa(nombre: string, rfc?: string, logoUri?: string) {
  const database = getDb();
  const existing = await getEmpresa();
  if (existing) {
    await database.runAsync(
      'UPDATE empresa SET nombre=?, rfc=?, logo_uri=? WHERE id=?',
      [nombre, rfc ?? null, logoUri ?? null, existing.id]
    );
    return existing.id;
  }
  const result = await database.runAsync(
    'INSERT INTO empresa (nombre, rfc, logo_uri) VALUES (?,?,?)',
    [nombre, rfc ?? null, logoUri ?? null]
  );
  return result.lastInsertRowId;
}

// ─── Seed desde PDF extraído ──────────────────────────────────────────────────

/**
 * Carga todos los datos extraídos del PDF en la base de datos.
 * Crea o reutiliza la desarrolladora JAVER, crea el proyecto y sus conceptos.
 */
export async function seedFromContract(
  data: ContratoExtraido,
  empresaId: number,
  desarrolladoraNombre: string = 'CASAS JAVER DE MEXICO S.A. DE C.V.'
): Promise<number> {
  const database = getDb();

  // 1. Desarrolladora
  let desarrolladora = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM desarrolladora WHERE nombre=?', [desarrolladoraNombre]
  );
  if (!desarrolladora) {
    const r = await database.runAsync(
      'INSERT INTO desarrolladora (nombre) VALUES (?)', [desarrolladoraNombre]
    );
    desarrolladora = { id: r.lastInsertRowId };
  }

  // 2. Derived fields from new ContratoExtraido shape
  const totalUnidades = data.conceptos[0]?.factorTotal ?? 0;
  const prototipo = data.conceptos[0]?.prototipos[0] ?? '';

  // 3. Proyecto
  const proyectoResult = await database.runAsync(
    `INSERT INTO proyecto (
      codigo, numero_contrato, nombre, descripcion_contrato,
      empresa_id, desarrolladora_id,
      frente, conjunto, monto_contrato,
      total_unidades, factor_por_seccion, prototipo,
      fecha_inicio, fecha_terminacion
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.conjunto,
      data.numeroContrato,
      `${data.conjunto} — ${data.contratista}`,
      data.descripcionObra ?? '',
      empresaId,
      desarrolladora.id,
      'FRENTE 01',
      data.conjunto,
      data.montoContrato,
      totalUnidades,
      data.conceptos[0]?.factorTotal ?? 5,
      prototipo,
      '',  // fechaInicio — not extracted
      '',  // fechaTerminacion — not extracted
    ]
  );
  const proyectoId = proyectoResult.lastInsertRowId;

  // 4. Conceptos (batch insert)
  for (let i = 0; i < data.conceptos.length; i++) {
    const c = data.conceptos[i];
    // Split "code - description" back into separate fields
    const dashIdx = c.actividad.indexOf(' - ');
    const actividadCode = dashIdx >= 0 ? c.actividad.slice(0, dashIdx) : c.actividad;
    const descripcion = dashIdx >= 0 ? c.actividad.slice(dashIdx + 3) : '';
    await database.runAsync(
      `INSERT INTO concepto (
        proyecto_id, actividad, descripcion, unidad,
        costo_unitario, factor, paquete, subpaquete, orden
      ) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        proyectoId,
        actividadCode,
        descripcion,
        c.unidad,
        c.costoUnitario,
        c.factorTotal,
        c.paquete,
        c.subpaquete,
        i,
      ]
    );
  }

  return proyectoId;
}

// ─── Proyectos ────────────────────────────────────────────────────────────────

export async function getProyectos() {
  const database = getDb();
  return database.getAllAsync<{
    id: number; codigo: string; numero_contrato: string;
    nombre: string; monto_contrato: number;
    semana_actual: number; numero_estimacion_actual: number;
  }>('SELECT * FROM proyecto ORDER BY created_at DESC');
}

export async function getProyectoById(id: number) {
  return getDb().getFirstAsync<any>('SELECT * FROM proyecto WHERE id=?', [id]);
}

// ─── Conceptos ────────────────────────────────────────────────────────────────

export async function getConceptosByProyecto(proyectoId: number) {
  return getDb().getAllAsync<any>(
    'SELECT * FROM concepto WHERE proyecto_id=? ORDER BY orden', [proyectoId]
  );
}

// ─── Estimaciones ─────────────────────────────────────────────────────────────

export async function crearEstimacion(
  proyectoId: number,
  numero: number,
  semana: number,
  periodoDesde: string,
  periodoHasta: string,
  weekNumber: number = 0
): Promise<number> {
  const r = await getDb().runAsync(
    `INSERT INTO estimacion (proyecto_id, numero, semana, week_number, periodo_desde, periodo_hasta)
     VALUES (?,?,?,?,?,?)`,
    [proyectoId, numero, semana, weekNumber, periodoDesde, periodoHasta]
  );
  return r.lastInsertRowId;
}

export async function getEstimacionesByProyecto(proyectoId: number) {
  return getDb().getAllAsync<any>(
    'SELECT * FROM estimacion WHERE proyecto_id=? ORDER BY numero DESC', [proyectoId]
  );
}

export async function getEstimacionById(id: number) {
  return getDb().getFirstAsync<any>('SELECT * FROM estimacion WHERE id=?', [id]);
}

// ─── Detalles ─────────────────────────────────────────────────────────────────

export async function upsertDetalle(
  estimacionId: number,
  conceptoId: number,
  cantidadAnterior: number,
  cantidadEstaEst: number,
  costoUnitario: number
) {
  const database = getDb();
  const cantidadAcumulada = cantidadAnterior + cantidadEstaEst;
  const importeAnterior = cantidadAnterior * costoUnitario;
  const importeEstaEst = cantidadEstaEst * costoUnitario;
  const importeAcumulado = cantidadAcumulada * costoUnitario;

  // Necesitamos el factor (total unidades) para calcular avance
  const concepto = await getDb().getFirstAsync<{ factor: number }>(
    'SELECT factor FROM concepto WHERE id=?', [conceptoId]
  );
  const avance = concepto
    ? Math.round((cantidadAcumulada / (concepto.factor || 1)) * 10000) / 100
    : 0;

  const existing = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM detalle_estimacion WHERE estimacion_id=? AND concepto_id=?',
    [estimacionId, conceptoId]
  );

  if (existing) {
    await database.runAsync(
      `UPDATE detalle_estimacion SET
        cantidad_anterior=?, cantidad_esta_est=?, cantidad_acumulada=?,
        importe_anterior=?, importe_esta_est=?, importe_acumulado=?,
        avance_financiero=?
       WHERE id=?`,
      [cantidadAnterior, cantidadEstaEst, cantidadAcumulada,
       importeAnterior, importeEstaEst, importeAcumulado,
       avance, existing.id]
    );
  } else {
    await database.runAsync(
      `INSERT INTO detalle_estimacion (
        estimacion_id, concepto_id,
        cantidad_anterior, cantidad_esta_est, cantidad_acumulada,
        importe_anterior, importe_esta_est, importe_acumulado,
        avance_financiero
       ) VALUES (?,?,?,?,?,?,?,?,?)`,
      [estimacionId, conceptoId,
       cantidadAnterior, cantidadEstaEst, cantidadAcumulada,
       importeAnterior, importeEstaEst, importeAcumulado,
       avance]
    );
  }
}

export async function getDetallesByEstimacion(estimacionId: number) {
  return getDb().getAllAsync<any>(
    `SELECT d.*, c.actividad, c.descripcion, c.unidad, c.costo_unitario, c.factor
     FROM detalle_estimacion d
     JOIN concepto c ON c.id = d.concepto_id
     WHERE d.estimacion_id=?
     ORDER BY c.orden`,
    [estimacionId]
  );
}

// ─── Evidencia ────────────────────────────────────────────────────────────────

export async function getEvidenciasByEstimacion(estimacionId: number) {
  return getDb().getAllAsync<any>(
    'SELECT * FROM evidencia WHERE estimacion_id=? ORDER BY created_at DESC',
    [estimacionId]
  );
}

export async function insertEvidencia(
  estimacionId: number, imagenUri: string,
  actividad?: string, descripcion?: string, conceptoId?: number
) {
  const r = await getDb().runAsync(
    `INSERT INTO evidencia (estimacion_id, concepto_id, imagen_uri, actividad, descripcion)
     VALUES (?,?,?,?,?)`,
    [estimacionId, conceptoId ?? null, imagenUri, actividad ?? null, descripcion ?? null]
  );
  return r.lastInsertRowId;
}

export async function deleteEvidencia(id: number) {
  await getDb().runAsync('DELETE FROM evidencia WHERE id=?', [id]);
}

// ─── Croquis ──────────────────────────────────────────────────────────────────

export async function getCroquisByEstimacion(estimacionId: number) {
  return getDb().getAllAsync<any>(
    'SELECT * FROM croquis WHERE estimacion_id=? ORDER BY created_at DESC',
    [estimacionId]
  );
}

export async function insertCroquis(estimacionId: number, imagenUri: string, descripcion?: string) {
  const r = await getDb().runAsync(
    'INSERT INTO croquis (estimacion_id, imagen_uri, descripcion) VALUES (?,?,?)',
    [estimacionId, imagenUri, descripcion ?? null]
  );
  return r.lastInsertRowId;
}

export async function deleteCroquis(id: number) {
  await getDb().runAsync('DELETE FROM croquis WHERE id=?', [id]);
}

// ─── Totales ──────────────────────────────────────────────────────────────────

export async function recalcularTotalesEstimacion(estimacionId: number) {
  const database = getDb();
  const detalles = await database.getAllAsync<{ importe_esta_est: number }>(
    'SELECT importe_esta_est FROM detalle_estimacion WHERE estimacion_id=?',
    [estimacionId]
  );
  const subtotal = detalles.reduce((sum, d) => sum + (d.importe_esta_est || 0), 0);
  const retencion = subtotal * 0.05;
  const totalAPagar = subtotal - retencion;

  await database.runAsync(
    'UPDATE estimacion SET subtotal=?, retencion=?, total_a_pagar=? WHERE id=?',
    [subtotal, retencion, totalAPagar, estimacionId]
  );
  return { subtotal, retencion, totalAPagar };
}
