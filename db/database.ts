/**
 * database.ts
 * Inicialización y operaciones principales de SQLite.
 */

import * as SQLite from 'expo-sqlite';
import { MIGRATIONS, DB_NAME } from './schema';
import type { CellState } from './schema';
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
      // Migración incremental: agrega cell_state si no existe (DBs previas)
      try {
        await database.execAsync(
          `ALTER TABLE detalle_estimacion ADD COLUMN cell_state TEXT DEFAULT 'empty';`
        );
      } catch {
        // columna ya existe — ignorar
      }
      // Migraciones P0: columnas añadidas en sesión 9
      try {
        await database.execAsync(`ALTER TABLE estimacion ADD COLUMN week_number INTEGER DEFAULT 0`);
      } catch (_) {}
      try {
        await database.execAsync(`ALTER TABLE estimacion ADD COLUMN cell_state TEXT DEFAULT 'empty'`);
      } catch (_) {}
      try {
        await database.execAsync(`ALTER TABLE concepto ADD COLUMN paquete TEXT DEFAULT ''`);
      } catch (_) {}
      try {
        await database.execAsync(`ALTER TABLE proyecto ADD COLUMN alias TEXT DEFAULT ''`);
      } catch (_) {}
      try {
        await database.execAsync(`ALTER TABLE proyecto ADD COLUMN fondo_garantia REAL DEFAULT 0`);
      } catch (_) {}
      // Multi-cuenta: user_id en proyecto y empresa
      try {
        await database.execAsync(`ALTER TABLE proyecto ADD COLUMN user_id TEXT DEFAULT ''`);
      } catch (_) {}
      try {
        await database.execAsync(`ALTER TABLE empresa ADD COLUMN user_id TEXT DEFAULT ''`);
      } catch (_) {}
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

export async function getEmpresa(userId?: string) {
  const database = getDb();
  if (userId && userId !== 'default') {
    const emp = await database.getFirstAsync<{ id: number; nombre: string; rfc: string; logo_uri: string }>(
      'SELECT * FROM empresa WHERE user_id=? LIMIT 1', [userId]
    );
    if (emp) return emp;
  }
  // backwards compat: si no hay empresa con user_id, retornar cualquiera
  return database.getFirstAsync<{ id: number; nombre: string; rfc: string; logo_uri: string }>(
    'SELECT * FROM empresa LIMIT 1'
  );
}

export async function upsertEmpresa(nombre: string, rfc?: string, logoUri?: string, userId?: string) {
  const database = getDb();
  const existing = await getEmpresa(userId);
  if (existing) {
    await database.runAsync(
      'UPDATE empresa SET nombre=?, rfc=?, logo_uri=?, user_id=? WHERE id=?',
      [nombre, rfc ?? null, logoUri ?? null, userId ?? '', existing.id]
    );
    return existing.id;
  }
  const result = await database.runAsync(
    'INSERT INTO empresa (nombre, rfc, logo_uri, user_id) VALUES (?,?,?,?)',
    [nombre, rfc ?? null, logoUri ?? null, userId ?? '']
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
  userId: string = '',
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
      fecha_inicio, fecha_terminacion, fondo_garantia, user_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.conjunto,
      data.numeroContrato,
      `${data.conjunto}${data.contratista ? ' — ' + data.contratista.substring(0, 50) : ''}`,
      data.descripcionObra ?? '',
      empresaId,
      desarrolladora.id,
      data.frente || 'FRENTE 01',
      data.conjunto,
      data.montoContrato,
      totalUnidades,
      data.conceptos[0]?.factorTotal ?? 5,
      prototipo,
      '',  // fechaInicio — not extracted
      '',  // fechaTerminacion — not extracted
      data.fondoGarantia ?? 0,
      userId,
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

export async function getProyectos(userId?: string) {
  const database = getDb();
  // Si userId es vacio o 'default', mostrar todos (backwards compat para usuarios existentes)
  if (!userId || userId === 'default') {
    return database.getAllAsync<{
      id: number; codigo: string; numero_contrato: string;
      nombre: string; monto_contrato: number;
      semana_actual: number; numero_estimacion_actual: number;
    }>('SELECT * FROM proyecto ORDER BY created_at DESC');
  }
  return database.getAllAsync<{
    id: number; codigo: string; numero_contrato: string;
    nombre: string; monto_contrato: number;
    semana_actual: number; numero_estimacion_actual: number;
  }>('SELECT * FROM proyecto WHERE user_id=? OR user_id=\'\' ORDER BY created_at DESC', [userId]);
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

// ─── Cantidades Anteriores (Issue #1) ─────────────────────────────────────────

/**
 * Retorna para cada concepto del proyecto la cantidad ya estimada en estimaciones
 * ANTERIORES (excluyendo la estimación actual).
 * cantidad = SUM(cantidad_acumulada) de todas las otras estimaciones
 * semana   = MAX(week_number) de la estimación más reciente donde fue estimado
 */
export async function getCantidadesAnteriores(
  proyectoId: number,
  estimacionActualId: number
): Promise<Record<number, { cantidad: number; semana: number }>> {
  const database = getDb();
  const rows = await database.getAllAsync<{
    concepto_id: number;
    total_cantidad: number;
    max_semana: number;
  }>(
    `SELECT d.concepto_id,
            SUM(d.cantidad_acumulada) as total_cantidad,
            MAX(e.week_number) as max_semana
     FROM detalle_estimacion d
     JOIN estimacion e ON e.id = d.estimacion_id
     WHERE e.proyecto_id = ? AND e.id != ? AND d.cantidad_acumulada > 0
     GROUP BY d.concepto_id`,
    [proyectoId, estimacionActualId]
  );

  const result: Record<number, { cantidad: number; semana: number }> = {};
  for (const row of rows) {
    result[row.concepto_id] = {
      cantidad: row.total_cantidad,
      semana: row.max_semana,
    };
  }
  return result;
}

// ─── Borrar Estimación (Issue #6: reordenar consecutivos) ────────────────────

export async function deleteEstimacion(estimacionId: number): Promise<void> {
  const database = getDb();

  // 1. Get estimacion info
  const est = await database.getFirstAsync<{ numero: number; proyecto_id: number }>(
    'SELECT numero, proyecto_id FROM estimacion WHERE id=?', [estimacionId]
  );
  if (!est) return;

  // 2-4. Delete related records explicitly
  await database.runAsync('DELETE FROM detalle_estimacion WHERE estimacion_id=?', [estimacionId]);
  await database.runAsync('DELETE FROM evidencia WHERE estimacion_id=?', [estimacionId]);
  await database.runAsync('DELETE FROM croquis WHERE estimacion_id=?', [estimacionId]);

  // 5. Delete the estimacion
  await database.runAsync('DELETE FROM estimacion WHERE id=?', [estimacionId]);

  // 6. Reorder: decrement numero for all estimaciones after the deleted one
  await database.runAsync(
    'UPDATE estimacion SET numero = numero - 1 WHERE proyecto_id=? AND numero > ?',
    [est.proyecto_id, est.numero]
  );

  // 7. Update project counter to MAX(numero) or 0
  const maxRow = await database.getFirstAsync<{ max_num: number }>(
    'SELECT COALESCE(MAX(numero), 0) as max_num FROM estimacion WHERE proyecto_id=?',
    [est.proyecto_id]
  );
  await database.runAsync(
    'UPDATE proyecto SET numero_estimacion_actual=? WHERE id=?',
    [maxRow?.max_num ?? 0, est.proyecto_id]
  );
}

// ─── Actualizar alias de proyecto ──────────────────────────────────────────────

export async function updateProyectoAlias(proyectoId: number, alias: string): Promise<void> {
  const database = getDb();
  await database.runAsync('UPDATE proyecto SET alias=? WHERE id=?', [alias, proyectoId]);
}

// ─── Borrar Proyecto (cascada) ────────────────────────────────────────────────

export async function deleteProyecto(proyectoId: number): Promise<void> {
  const database = getDb();
  // Borrar en orden: detalle_estimacion → estimacion → concepto → proyecto
  // (evidencia y croquis se eliminan por CASCADE desde estimacion si está configurado,
  // pero lo hacemos explícito para garantizar integridad)
  const estimaciones = await database.getAllAsync<{ id: number }>(
    'SELECT id FROM estimacion WHERE proyecto_id=?', [proyectoId]
  );
  for (const est of estimaciones) {
    await database.runAsync('DELETE FROM detalle_estimacion WHERE estimacion_id=?', [est.id]);
    await database.runAsync('DELETE FROM evidencia WHERE estimacion_id=?', [est.id]);
    await database.runAsync('DELETE FROM croquis WHERE estimacion_id=?', [est.id]);
  }
  await database.runAsync('DELETE FROM estimacion WHERE proyecto_id=?', [proyectoId]);
  await database.runAsync('DELETE FROM concepto WHERE proyecto_id=?', [proyectoId]);
  await database.runAsync('DELETE FROM proyecto WHERE id=?', [proyectoId]);
}

// ─── Actualizar contadores del proyecto ───────────────────────────────────────

export async function incrementarContadoresProyecto(
  proyectoId: number,
  nuevaEstimacionNumero: number,
  nuevaSemana: number
): Promise<void> {
  await getDb().runAsync(
    'UPDATE proyecto SET numero_estimacion_actual=?, semana_actual=? WHERE id=?',
    [nuevaEstimacionNumero + 1, nuevaSemana + 1, proyectoId]
  );
}

// ─── Última estimación de un proyecto ─────────────────────────────────────────

export async function getUltimaEstimacionByProyecto(proyectoId: number) {
  return getDb().getFirstAsync<any>(
    'SELECT * FROM estimacion WHERE proyecto_id=? ORDER BY numero DESC LIMIT 1',
    [proyectoId]
  );
}

// ─── Cell State (para Modo Actualización) ────────────────────────────────────

/**
 * Actualiza cell_state en detalle_estimacion para un concepto dado.
 * Crea el registro si no existe (con cantidad_esta_est = 0).
 */
export async function updateCellStates(
  estimacionId: number,
  conceptoId: number,
  newState: CellState,
  costoUnitario: number
): Promise<void> {
  const database = getDb();
  const existing = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM detalle_estimacion WHERE estimacion_id=? AND concepto_id=?',
    [estimacionId, conceptoId]
  );
  if (existing) {
    await database.runAsync(
      'UPDATE detalle_estimacion SET cell_state=? WHERE id=?',
      [newState, existing.id]
    );
  } else {
    await database.runAsync(
      `INSERT INTO detalle_estimacion
         (estimacion_id, concepto_id, cantidad_anterior, cantidad_esta_est,
          cantidad_acumulada, importe_anterior, importe_esta_est,
          importe_acumulado, avance_financiero, cell_state)
       VALUES (?,?,0,0,0,0,0,0,0,?)`,
      [estimacionId, conceptoId, newState]
    );
  }
}

/**
 * Obtiene el cell_state persistido para un concepto en una estimación.
 */
export async function getCellStateForConcepto(
  estimacionId: number,
  conceptoId: number
): Promise<CellState> {
  const row = await getDb().getFirstAsync<{ cell_state: string }>(
    'SELECT cell_state FROM detalle_estimacion WHERE estimacion_id=? AND concepto_id=?',
    [estimacionId, conceptoId]
  );
  return (row?.cell_state as CellState) ?? 'empty';
}

/**
 * Actualiza el número de estimación (estim_number) en la tabla estimacion.
 */
export async function updateEstimNumero(estimacionId: number, numero: number): Promise<void> {
  await getDb().runAsync(
    'UPDATE estimacion SET numero=? WHERE id=?',
    [numero, estimacionId]
  );
}

/**
 * Persiste estado "estimated_prior" para todos los conceptos cuyo estado sea
 * "update_pending" en el mapa local pasado como argumento.
 * Retorna la lista de conceptoIds actualizados.
 */
export async function guardarActualizacion(
  estimacionId: number,
  updatePendingIds: number[],
  costoUnitarioMap: Record<number, number>
): Promise<void> {
  for (const conceptoId of updatePendingIds) {
    await updateCellStates(
      estimacionId,
      conceptoId,
      'estimated_prior',
      costoUnitarioMap[conceptoId] ?? 0
    );
  }
}
