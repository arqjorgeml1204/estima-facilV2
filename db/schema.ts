/**
 * schema.ts
 * Definición completa del schema SQLite para EstimaFácil.
 * 8 entidades, todas con almacenamiento 100% local.
 */

import * as SQLite from 'expo-sqlite';

export const DB_NAME = 'estimafacil.db';

// ─── Tipos TypeScript ─────────────────────────────────────────────────────────

export interface Empresa {
  id: number;
  nombre: string;
  rfc?: string;
  logoUri?: string;
  createdAt: string;
}

export interface Desarrolladora {
  id: number;
  nombre: string;           // "CASAS JAVER DE MEXICO S.A. DE C.V."
  logoUri?: string;
}

export interface Proyecto {
  id: number;
  codigo: string;           // "D38-01-C03-18"
  numeroContrato: string;   // "MX-EDI-COV-168827"
  nombre: string;           // descripción corta
  descripcionContrato: string; // NOTAS del PDF
  empresaId: number;
  desarrolladoraId: number;
  frente: string;           // "FRENTE 01 EDIFICACION"
  conjunto: string;         // "D38-01-C03-18"
  montoContrato: number;
  totalUnidades: number;    // 20
  factorPorSeccion: number; // 5
  prototipo: string;        // "EDIF-5000"
  fechaInicio: string;
  fechaTerminacion: string;
  semanaActual: number;
  numeroEstimacionActual: number;
  createdAt: string;
}

export interface Concepto {
  id: number;
  proyectoId: number;
  actividad: string;        // "4.10.0002"
  descripcion: string;      // "TRAZO Y NIVELACION DEL TERRENO"
  unidad: string;           // "LOT"
  costoUnitario: number;    // 138.15
  factor: number;           // 20 (total unidades del contrato)
  paquete: string;          // "PRELIMINARES"
  subpaquete: string;       // "TRAZO Y NIVELACIÓN DEL TERRENO"
  orden: number;            // para mantener el orden original
}

export interface Estimacion {
  id: number;
  proyectoId: number;
  numero: number;
  semana: number;
  periodoDesde: string;
  periodoHasta: string;
  fecha: string;
  subtotal: number;
  retencion: number;        // 5%
  totalAPagar: number;
  estimadoAcumulado: number;
  status: 'borrador' | 'finalizada';
  createdAt: string;
}

export interface DetalleEstimacion {
  id: number;
  estimacionId: number;
  conceptoId: number;
  cantidadAnterior: number;
  cantidadEstaEst: number;
  cantidadAcumulada: number;
  importeAnterior: number;
  importeEstaEst: number;
  importeAcumulado: number;
  avanceFinanciero: number; // porcentaje 0-100
}

export interface Evidencia {
  id: number;
  estimacionId: number;
  conceptoId?: number;
  imagenUri: string;        // ruta local FileSystem.documentDirectory
  actividad: string;
  descripcion: string;
  createdAt: string;
}

export interface Croquis {
  id: number;
  estimacionId: number;
  imagenUri: string;
  descripcion: string;
  createdAt: string;
}

// ─── DDL — Creación de tablas ─────────────────────────────────────────────────

export const MIGRATIONS = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS empresa (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT    NOT NULL,
    rfc         TEXT,
    logo_uri    TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS desarrolladora (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT    NOT NULL,
    logo_uri    TEXT
  );

  CREATE TABLE IF NOT EXISTS proyecto (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo                   TEXT    NOT NULL,
    numero_contrato          TEXT    NOT NULL,
    nombre                   TEXT    NOT NULL,
    descripcion_contrato     TEXT,
    empresa_id               INTEGER REFERENCES empresa(id),
    desarrolladora_id        INTEGER REFERENCES desarrolladora(id),
    frente                   TEXT,
    conjunto                 TEXT,
    monto_contrato           REAL    NOT NULL,
    total_unidades           INTEGER DEFAULT 1,
    factor_por_seccion       INTEGER DEFAULT 1,
    prototipo                TEXT,
    fecha_inicio             TEXT,
    fecha_terminacion        TEXT,
    semana_actual            INTEGER DEFAULT 1,
    numero_estimacion_actual INTEGER DEFAULT 1,
    created_at               TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS concepto (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id    INTEGER NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
    actividad      TEXT    NOT NULL,
    descripcion    TEXT    NOT NULL,
    unidad         TEXT    NOT NULL,
    costo_unitario REAL    NOT NULL,
    factor         INTEGER NOT NULL,
    paquete        TEXT,
    subpaquete     TEXT,
    orden          INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS estimacion (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id         INTEGER NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
    numero              INTEGER NOT NULL,
    semana              INTEGER NOT NULL,
    periodo_desde       TEXT,
    periodo_hasta       TEXT,
    fecha               TEXT    DEFAULT (datetime('now')),
    subtotal            REAL    DEFAULT 0,
    retencion           REAL    DEFAULT 0,
    total_a_pagar       REAL    DEFAULT 0,
    estimado_acumulado  REAL    DEFAULT 0,
    status              TEXT    DEFAULT 'borrador',
    created_at          TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS detalle_estimacion (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    estimacion_id        INTEGER NOT NULL REFERENCES estimacion(id) ON DELETE CASCADE,
    concepto_id          INTEGER NOT NULL REFERENCES concepto(id),
    cantidad_anterior    REAL    DEFAULT 0,
    cantidad_esta_est    REAL    DEFAULT 0,
    cantidad_acumulada   REAL    DEFAULT 0,
    importe_anterior     REAL    DEFAULT 0,
    importe_esta_est     REAL    DEFAULT 0,
    importe_acumulado    REAL    DEFAULT 0,
    avance_financiero    REAL    DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS evidencia (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    estimacion_id  INTEGER NOT NULL REFERENCES estimacion(id) ON DELETE CASCADE,
    concepto_id    INTEGER REFERENCES concepto(id),
    imagen_uri     TEXT    NOT NULL,
    actividad      TEXT,
    descripcion    TEXT,
    created_at     TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS croquis (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    estimacion_id  INTEGER NOT NULL REFERENCES estimacion(id) ON DELETE CASCADE,
    imagen_uri     TEXT    NOT NULL,
    descripcion    TEXT,
    created_at     TEXT    DEFAULT (datetime('now'))
  );
`;
