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
      // Migración no destructiva: agrega `subpaquete` para DBs previas al fix
      // de agrupamiento (sesión actual). Proyectos existentes mantendrán
      // subpaquete = '' / NULL y el grid debe manejar esos casos.
      try {
        await database.execAsync(`ALTER TABLE concepto ADD COLUMN subpaquete TEXT DEFAULT ''`);
      } catch (_) {}
      try {
        await database.execAsync(`ALTER TABLE proyecto ADD COLUMN alias TEXT DEFAULT ''`);
      } catch (_) {}
      try {
        await database.execAsync(`ALTER TABLE proyecto ADD COLUMN fondo_garantia REAL DEFAULT 0`);
      } catch (_) {}
      // Nuevas columnas: frente desdoblado en numero+nombre y % fondo garantía.
      // Backward-compat: proyectos viejos quedan con defaults '01' / '' / 5.
      try {
        await database.execAsync(`ALTER TABLE proyecto ADD COLUMN frente_numero TEXT DEFAULT '01'`);
      } catch (_) {}
      try {
        await database.execAsync(`ALTER TABLE proyecto ADD COLUMN frente_nombre TEXT DEFAULT ''`);
      } catch (_) {}
      try {
        await database.execAsync(`ALTER TABLE proyecto ADD COLUMN fondo_garantia_pct REAL DEFAULT 5`);
      } catch (_) {}
      // Multi-cuenta: user_id en proyecto y empresa
      try {
        await database.execAsync(`ALTER TABLE proyecto ADD COLUMN user_id TEXT DEFAULT ''`);
      } catch (_) {}
      try {
        await database.execAsync(`ALTER TABLE empresa ADD COLUMN user_id TEXT DEFAULT ''`);
      } catch (_) {}
      // Multi-obra: etiqueta el proyecto con la obra a la que pertenece.
      // Los proyectos pre-existentes quedan con obra_id NULL -> UI los
      // muestra como "Sin obra" (badge gris). Idempotente via try/catch.
      try {
        await database.execAsync(`ALTER TABLE proyecto ADD COLUMN obra_id TEXT`);
      } catch (_) {}
      // Tabla usuarios (auth local)
      try {
        await database.execAsync(`
          CREATE TABLE IF NOT EXISTS usuarios (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       TEXT    UNIQUE NOT NULL,
            nombre        TEXT    NOT NULL,
            password_hash TEXT    NOT NULL,
            salt          TEXT    NOT NULL,
            created_at    TEXT    DEFAULT (datetime('now'))
          )
        `);
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
  // expo-sqlite 16: lastInsertRowId puede ser bigint -> casteamos con Number()
  return Number(result.lastInsertRowId);
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
  desarrolladoraNombre: string = 'CASAS JAVER DE MEXICO S.A. DE C.V.',
  obraId: string | null = null
): Promise<number> {
  const database = getDb();

  // Helper local: convierte cualquier valor a número finito; si es null/undefined/NaN
  // o ±Infinity, retorna `fallback`. Bindear NaN o null a columnas REAL/INTEGER
  // NOT NULL en expo-sqlite dispara java.lang.NullPointerException en prepareAsync.
  const toFiniteNumber = (v: any, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  // 1. Desarrolladora
  let desarrolladora = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM desarrolladora WHERE nombre=?', [desarrolladoraNombre]
  );
  if (!desarrolladora) {
    const r = await database.runAsync(
      'INSERT INTO desarrolladora (nombre) VALUES (?)', [desarrolladoraNombre]
    );
    // expo-sqlite 16: lastInsertRowId puede ser bigint -> casteamos con Number()
    desarrolladora = { id: Number(r.lastInsertRowId) };
  }

  // 2. Derived fields from new ContratoExtraido shape
  const firstConcepto = data.conceptos && data.conceptos.length > 0 ? data.conceptos[0] : null;
  const totalUnidades = toFiniteNumber(firstConcepto?.factorTotal, 0);
  const prototipo = (firstConcepto?.prototipos && firstConcepto.prototipos[0]) || '';
  const factorPorSeccionSafe = toFiniteNumber(firstConcepto?.factorTotal, 5);

  // 3. Proyecto
  // Frente: el extractor devuelve numero+nombre por separado.
  // Back-compat: la columna legacy `frente` sigue siendo TEXT; la rellenamos con
  // el string compuesto "FRENTE {numero} {nombre}" para que pantallas antiguas
  // que leen `frente` sigan funcionando sin cambios.
  const frenteNumero = (data.frenteNumero && data.frenteNumero.trim()) || '01';
  const frenteNombre = (data.frenteNombre && data.frenteNombre.trim()) || '';
  const frenteLegacy = frenteNombre
    ? `FRENTE ${frenteNumero} ${frenteNombre}`
    : `FRENTE ${frenteNumero}`;
  const fondoGarantiaPct = toFiniteNumber(data.fondoGarantia, 5);

  // Sanitización null-safe: los campos de ContratoExtraido son `string | null` /
  // `number | null` (ver services/pdfExtractor/types.ts). Bindear null a columnas
  // NOT NULL en SQLite produce java.lang.NullPointerException en prepareAsync.
  // Normalizamos aquí con fallbacks seguros.
  const conjuntoSafe = (data.conjunto && data.conjunto.trim()) || 'SIN-CODIGO';
  const numeroContratoSafe = (data.numeroContrato && data.numeroContrato.trim()) || 'SIN-NUMERO';
  const montoContratoSafe = toFiniteNumber(data.montoContrato, 0);
  const contratistaSafe = data.contratista ? ' — ' + data.contratista.substring(0, 50) : '';
  const nombreSafe = `${conjuntoSafe}${contratistaSafe}`;
  const descripcionObraSafe = data.descripcionObra ?? '';

  const proyectoResult = await database.runAsync(
    `INSERT INTO proyecto (
      codigo, numero_contrato, nombre, descripcion_contrato,
      empresa_id, desarrolladora_id,
      frente, frente_numero, frente_nombre, conjunto, monto_contrato,
      total_unidades, factor_por_seccion, prototipo,
      fecha_inicio, fecha_terminacion, fondo_garantia, fondo_garantia_pct, user_id,
      obra_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      conjuntoSafe,
      numeroContratoSafe,
      nombreSafe,
      descripcionObraSafe,
      empresaId,
      desarrolladora.id,
      frenteLegacy,
      frenteNumero,
      frenteNombre,
      conjuntoSafe,
      montoContratoSafe,
      totalUnidades,
      factorPorSeccionSafe,
      prototipo,
      '',  // fechaInicio — not extracted
      '',  // fechaTerminacion — not extracted
      fondoGarantiaPct,    // legacy column (mantenida por back-compat)
      fondoGarantiaPct,    // nueva columna explícita
      userId ?? '',
      obraId,              // etiqueta por obra (null = legacy "sin obra")
    ]
  );
  // expo-sqlite 16: lastInsertRowId puede ser bigint -> casteamos con Number()
  const proyectoId = Number(proyectoResult.lastInsertRowId);

  // 4. Conceptos (batch insert)
  // Null-safe: tabla concepto tiene unidad/costo_unitario/factor NOT NULL.
  // Los campos del extractor son nullables (ver types.ts), así que normalizamos.
  for (let i = 0; i < data.conceptos.length; i++) {
    const c = data.conceptos[i];
    // Split "code - description" back into separate fields
    const actividadStr = c.actividad || '';
    const dashIdx = actividadStr.indexOf(' - ');
    const actividadCodeRaw = dashIdx >= 0 ? actividadStr.slice(0, dashIdx) : actividadStr;
    const descripcionRaw = dashIdx >= 0 ? actividadStr.slice(dashIdx + 3) : '';
    // Defensa extra: actividad/descripcion son NOT NULL en concepto.
    const actividadCode = (actividadCodeRaw && actividadCodeRaw.trim()) || `SIN-COD-${i}`;
    const descripcion = descripcionRaw || '';
    const unidadSafe = (c.unidad && c.unidad.trim()) || 'PZA';
    const costoUnitarioSafe = toFiniteNumber(c.costoUnitario, 0);
    const factorSafe = toFiniteNumber(c.factorTotal, 0);
    await database.runAsync(
      `INSERT INTO concepto (
        proyecto_id, actividad, descripcion, unidad,
        costo_unitario, factor, paquete, subpaquete, orden
      ) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        proyectoId,
        actividadCode,
        descripcion,
        unidadSafe,
        costoUnitarioSafe,
        factorSafe,
        c.paquete ?? '',
        c.subpaquete ?? '',
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
      obra_id: string | null;
    }>('SELECT * FROM proyecto ORDER BY created_at DESC');
  }
  return database.getAllAsync<{
    id: number; codigo: string; numero_contrato: string;
    nombre: string; monto_contrato: number;
    semana_actual: number; numero_estimacion_actual: number;
    obra_id: string | null;
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

// ─── Total Estimado por Proyecto ──────────────────────────────────────────────

/**
 * Calcula el total estimado acumulado de un proyecto.
 * Suma TANTO el periodo actual (importe_esta_est) COMO las cantidades
 * registradas en Modo Actualización (importe_anterior), ya que ambas
 * representan obra cobrada/por cobrar que consume el monto del contrato.
 *
 * Para evitar doble conteo: cantidad_anterior en una estimación N debería
 * reflejar la suma de cantidad_esta_est en estimaciones < N. Pero cuando
 * el usuario usa Modo Actualización, agrega cantidad_anterior sin que
 * exista una estimación previa que la aporte en cantidad_esta_est.
 *
 * Estrategia: por cada concepto, tomamos MAX(cantidad_acumulada) entre
 * todas sus estimaciones. Eso representa el total de obra avanzada.
 */
export async function getTotalEstimadoPorProyecto(proyectoId: number): Promise<number> {
  const result = await getDb().getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(max_importe), 0) as total
     FROM (
       SELECT MAX(de.importe_acumulado) as max_importe
       FROM detalle_estimacion de
       JOIN estimacion e ON de.estimacion_id = e.id
       WHERE e.proyecto_id = ?
       GROUP BY de.concepto_id
     )`,
    [proyectoId]
  );
  return result?.total ?? 0;
}

/**
 * Calcula el "Estimado Acumulado" del proyecto EXCLUYENDO la estimación actual.
 * Representa todo lo que ya se había estimado/cobrado antes del periodo actual.
 *
 * Por cada concepto:
 *   - Si existe en otras estimaciones: usa MAX(cantidad_acumulada) de esas otras
 *     (esto cubre cantidad_anterior de modo actualización aplicado en estimaciones previas).
 *   - Si solo existe en la estimación actual: usa cantidad_anterior de la actual
 *     (modo actualización registrado directamente en la estimación actual).
 */
export async function getEstimadoAcumuladoPrevio(
  proyectoId: number,
  estimacionActualId: number
): Promise<number> {
  const database = getDb();

  // Por concepto: MAX(cantidad_acumulada) en estimaciones distintas a la actual,
  // multiplicado por costo_unitario del concepto.
  const otrasRows = await database.getAllAsync<{
    concepto_id: number;
    max_acum: number;
    costo_unitario: number;
  }>(
    `SELECT d.concepto_id,
            MAX(d.cantidad_acumulada) as max_acum,
            c.costo_unitario as costo_unitario
     FROM detalle_estimacion d
     JOIN estimacion e ON e.id = d.estimacion_id
     JOIN concepto c ON c.id = d.concepto_id
     WHERE e.proyecto_id = ? AND e.id != ?
     GROUP BY d.concepto_id, c.costo_unitario`,
    [proyectoId, estimacionActualId]
  );

  const conceptoIdsEnOtras = new Set(otrasRows.map(r => r.concepto_id));
  let acumulado = 0;
  for (const r of otrasRows) {
    acumulado += (r.max_acum || 0) * (r.costo_unitario || 0);
  }

  // Conceptos que solo aparecen en la estimación actual (modo actualización puro)
  const actualRows = await database.getAllAsync<{
    concepto_id: number;
    importe_anterior: number;
  }>(
    `SELECT d.concepto_id, d.importe_anterior
     FROM detalle_estimacion d
     WHERE d.estimacion_id = ?`,
    [estimacionActualId]
  );

  for (const r of actualRows) {
    if (!conceptoIdsEnOtras.has(r.concepto_id)) {
      acumulado += r.importe_anterior || 0;
    }
  }

  return acumulado;
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

// ─── Actualizar obra de proyecto ──────────────────────────────────────────────

/**
 * Reasigna un proyecto a otra obra (o lo deja sin obra si obraId === null).
 * La columna obra_id es TEXT nullable y fue agregada en la migración idempotente
 * de initDatabase. No hay FK porque las obras viven en AsyncStorage (no en SQLite).
 */
export async function setProyectoObra(proyectoId: number, obraId: string | null): Promise<void> {
  const database = getDb();
  await database.runAsync('UPDATE proyecto SET obra_id = ? WHERE id = ?', [obraId, proyectoId]);
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

// ─── Auth local ──────────────────────────────────────────────────────────────

export async function createUsuario(
  userId: string,
  nombre: string,
  passwordHash: string,
  salt: string,
): Promise<void> {
  await getDb().runAsync(
    'INSERT INTO usuarios (user_id, nombre, password_hash, salt) VALUES (?,?,?,?)',
    [userId, nombre, passwordHash, salt],
  );
}

export async function getUsuarioByUserId(userId: string): Promise<{
  user_id: string;
  nombre: string;
  password_hash: string;
  salt: string;
} | null> {
  return getDb().getFirstAsync<{
    user_id: string;
    nombre: string;
    password_hash: string;
    salt: string;
  }>('SELECT user_id, nombre, password_hash, salt FROM usuarios WHERE user_id=?', [userId]);
}
