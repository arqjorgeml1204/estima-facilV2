/**
 * types.ts
 * Domain types, enums, and error class for the deterministic PDF extractor.
 * All definitions are consumed by PdfDeterministicExtractor and by the
 * persistence layer that maps ContratoExtraido → DB schema entities.
 */

// ─── Parser state machine ────────────────────────────────────────────────────

export enum ParserState {
  LEYENDO_ENCABEZADO = 'LEYENDO_ENCABEZADO',
  ESPERANDO_ALCANCE_DETALLADO = 'ESPERANDO_ALCANCE_DETALLADO',
  LEYENDO_CONCEPTOS = 'LEYENDO_CONCEPTOS',
  FINALIZADO = 'FINALIZADO',
}

// ─── Raw line data (intermediate, before aggregation) ────────────────────────

/**
 * Single row parsed directly from a PDF line before grouping by codigoActividad.
 * The `factor` here represents one A0X group occurrence; multiple rows for the
 * same activity are later summed into Concepto.factorTotal.
 */
export interface ConceptoRaw {
  /** e.g. "4.10.0002" */
  codigoActividad: string;
  /** e.g. "TRAZO Y NIVELACION DEL TERRENO" */
  descripcion: string;
  /** e.g. "LOT" */
  unidad: string;
  /** e.g. 138.15 */
  costoUnitario: number;
  /** Single-occurrence factor for one A0X group, e.g. 7 */
  factor: number;
}

// ─── Aggregated domain concept ────────────────────────────────────────────────

/**
 * Fully resolved concept after grouping all ConceptoRaw rows that share the
 * same codigoActividad. Maps 1-to-1 with the `concepto` table in the DB.
 */
export interface Concepto {
  /** All prototype labels that reference this concept, e.g. ["EDIF-5000 - AGUILA ELITE CUADRUPLEX"] */
  prototipos: string[];
  /** e.g. "10 - PRELIMINARES" — null when not determinable */
  paquete: string | null;
  /** e.g. "100 - TRAZO Y NIVELACION DEL TERRENO" — null when not determinable */
  subpaquete: string | null;
  /**
   * Code and description combined with " - " separator.
   * e.g. "4.10.0002 - TRAZO Y NIVELACION DEL TERRENO"
   * Matches DB column `actividad` (schema.ts Concepto.actividad stores the code;
   * here we store the full display string as expected by the extractor contract).
   */
  actividad: string;
  /** e.g. "LOT" — null when absent in the PDF */
  unidad: string | null;
  /** e.g. 138.15 — null when absent in the PDF */
  costoUnitario: number | null;
  /**
   * Sum of factor across all A0X groups for this activity.
   * Used as denominator: avance = (cantidadAcumulada / factorTotal) * 100
   */
  factorTotal: number;
}

// ─── Extracted contract ───────────────────────────────────────────────────────

/**
 * Top-level output of PdfDeterministicExtractor.extract().
 * Fields align with the `proyecto` table (schema.ts Proyecto):
 *   conjunto        → proyecto.conjunto
 *   numeroContrato  → proyecto.numeroContrato
 *   montoContrato   → proyecto.montoContrato
 *   conceptos       → concepto rows (one per entry)
 */
export interface ContratoExtraido {
  /** Contractor company name — null when not found in header */
  contratista: string | null;
  /** e.g. "D38-01-C03-20" */
  conjunto: string | null;
  /** e.g. "MX-EDI-COV-173482" */
  numeroContrato: string | null;
  /** Free-text work description from the PDF header */
  descripcionObra: string | null;
  /** Contract total amount in MXN */
  montoContrato: number | null;
  /** Ordered list of aggregated concepts */
  conceptos: Concepto[];
}

// ─── Extraction errors ────────────────────────────────────────────────────────

export type ExtractionErrorCode =
  | 'PDF_PROTEGIDO'
  | 'PDF_ESCANEADO'
  | 'ENCABEZADO_INCOMPLETO'
  | 'EXTRACCION_INCOMPLETA';

/**
 * Thrown by PdfDeterministicExtractor when the PDF cannot be parsed correctly.
 * `code` identifies the failure category; `campo` names the missing field when
 * code is 'ENCABEZADO_INCOMPLETO' or 'EXTRACCION_INCOMPLETA'.
 */
export class ExtractionError extends Error {
  code: ExtractionErrorCode;
  campo?: string;

  constructor(code: ExtractionErrorCode, message: string, campo?: string) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
    this.campo = campo;
  }
}
