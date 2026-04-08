/**
 * extractorRules.ts
 *
 * All regex-based detection and extraction functions for the deterministic
 * PDF parser. Every regex uses the `i` flag (case-insensitive) and avoids
 * catastrophic backtracking patterns.
 */

import type { ConceptoRaw } from './types';

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Remove non-printable chars, normalize dashes, trim.
 * Does NOT collapse multi-space gaps (the activity parser relies on them).
 */
export function cleanLine(line: string): string {
  return line
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[–—]/g, '-')
    .trim();
}

/**
 * Collapse runs of 2+ whitespace into a single space.
 * For use when collapsed text is needed (e.g. header buffers).
 */
export function collapseLine(line: string): string {
  return line.replace(/\s{2,}/g, ' ').trim();
}

// ─── Header extraction ───────────────────────────────────────────────────────

/**
 * Extract the contractor name.
 * New format: "Contratista <name> Fondo de garantía"
 * Fallback: old format "CONTRATISTA <name> APODERADO LEGAL"
 */
export function extractContratista(text: string): string | null {
  // New format: between "Contratista" and "Fondo de garantía"
  const newMatch = text.match(/Contratista\s+([\s\S]+?)\s+Fondo\s+de\s+garant[ií]a/i);
  if (newMatch) {
    const candidate = collapseLine(newMatch[1]);
    if (candidate) return candidate;
  }
  // Fallback: old format
  const re = /CONTRATISTA\s+([\s\S]*?)APODERADO\s+LEGAL/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const candidate = collapseLine(match[1]);
    if (candidate && !/JAVER/i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Extract the conjunto code from the "Alcance detallado" section.
 * Pattern: letter + 2 digits + dash + 2 digits + dash + letter + 2 digits + dash + 2 digits
 */
export function extractConjunto(text: string): string | null {
  const match = text.match(/([A-Z]\d{2}-\d{2}-[A-Z]\d{2}-\d{2})/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Extract the contract number. Pattern: MX-EDI-COV-digits with optional _AXX suffixes
 */
export function extractNumeroContrato(text: string): string | null {
  const match = text.match(/MX-EDI-COV-\d+(?:_[A-Z]\d+)*/i);
  return match ? match[0] : null;
}

/**
 * Extract the work description.
 * New format: "Notas <text>" from the alcance detallado section.
 * Fallback: old format between DESCRIPCION DEL SERVICIO and CONTRAPRESTACION.
 */
export function extractDescripcionObra(text: string): string | null {
  // New format: extract text after "Notas" until a known section or end
  const notasMatch = text.match(/^Notas\s+([\s\S]+?)(?=\n(?:Elementos|Prototipos|Actividad|$))/im);
  if (notasMatch) {
    const desc = collapseLine(notasMatch[1]);
    if (desc) return desc;
  }
  // Fallback: also try Notas without line-boundary delimiter (take rest of buffer)
  const notasFallback = text.match(/Notas\s+([\s\S]+)/i);
  if (notasFallback) {
    const desc = collapseLine(notasFallback[1]);
    if (desc) return desc;
  }
  // Old format
  const re = /DESCRIPCI[OÓ]N\s+DEL\s+SERVICIO\s+ESPECIALIZADO\s+A\s+REALIZAR\s*([\s\S]*?)CONTRAPRESTACI[OÓ]N\s+DEL/i;
  const match = text.match(re);
  if (!match) return null;
  const desc = collapseLine(match[1]);
  return desc || null;
}

/**
 * Extract contract amount in MXN.
 * New format: "Monto contratado 225,100.00 MXN"
 * Fallback: old format "$amount M.N."
 */
export function extractMonto(text: string): number | null {
  // New format
  const newMatch = text.match(/Monto\s+contratado\s+([\d,]+\.\d{2})\s+MXN/i);
  if (newMatch) {
    const value = parseFloat(newMatch[1].replace(/,/g, ''));
    return isNaN(value) ? null : value;
  }
  // Old format
  const match = text.match(/\$([\d,]+\.\d{2})\s*M\.?N\.?/i);
  if (!match) return null;
  const cleaned = match[1].replace(/,/g, '');
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

// ─── Alcance detallado extraction ────────────────────────────────────────────

/**
 * Extract frente description from alcance detallado.
 * Format: "Frente 01 - FRENTE 01 EDIFICACION"
 */
export function extractFrenteFromAlcance(text: string): string | null {
  const match = text.match(/^Frente\s+\d+\s*-\s*(.+)$/im);
  return match ? match[1].trim() : null;
}

/**
 * Extract fondo de garantía percentage.
 * Format: "Fondo de garantía 5 %"
 */
export function extractFondoGarantia(text: string): number | null {
  const match = text.match(/Fondo\s+de\s+garant[ií]a\s+(\d+(?:\.\d+)?)\s*%/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return isNaN(value) ? null : value;
}

// ─── Line detection (state machine) ──────────────────────────────────────────

/**
 * Detects the stop rule: "explosion de insumos de contrato por categoria".
 * MUST be evaluated FIRST in the LEYENDO_CONCEPTOS loop.
 */
export function isStopRule(line: string): boolean {
  return /explosion\s+de\s+insumos\s+de\s+contrato\s+por\s+categor[ií]a/i.test(line);
}

/**
 * Detects the table header row containing all column names.
 */
export function isTablaHeader(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes('actividad') &&
    lower.includes('cantidad') &&
    lower.includes('unidad') &&
    lower.includes('costo') &&
    lower.includes('factor')
  );
}

/**
 * Detects a prototype line. Pattern: EDIF-digits - NAME
 * Returns the cleaned prototype name or null.
 */
export function isPrototipo(line: string): string | null {
  const match = line.match(/^(EDIF-\d+\s*-\s*[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]*)/i);
  if (!match) return null;
  return collapseLine(match[1]);
}

/**
 * Detects a vivienda separator line. Pattern: A01 - VIV.
 * Returns the group number ("01", "02") or null.
 */
export function isSeparadorViv(line: string): string | null {
  const match = line.match(/^A(\d{2})\s*-\s*VIV\./i);
  return match ? match[1] : null;
}

/**
 * Detects a paquete line. ONLY 1-2 digit numbers followed by " - " and a name.
 * Name can contain accented chars, commas, periods, parentheses, numbers, etc.
 * Returns the full string "number - description" or null.
 */
export function isPaquete(line: string): string | null {
  const match = line.match(/^(\d{1,2})\s+-\s+(.+)$/);
  if (!match) return null;
  const desc = match[2].trim();
  if (!desc) return null;
  return `${match[1]} - ${collapseLine(desc)}`;
}

/**
 * Detects a subpaquete line. ONLY 3+ digit numbers followed by " - " and a name.
 * Name can contain accented chars, commas, periods, parentheses, numbers, etc.
 * Returns the full string or null.
 */
export function isSubpaquete(line: string): string | null {
  const match = line.match(/^(\d{3,})\s+-\s+(.+)$/);
  if (!match) return null;
  const desc = match[2].trim();
  if (!desc) return null;
  return `${match[1]} - ${collapseLine(desc)}`;
}

/**
 * Parses an activity line into a ConceptoRaw.
 * Uses multi-space gaps as column separators.
 */
export function parseLineaActividad(line: string): ConceptoRaw | null {
  const match = line.match(
    /^(\d+\.\d+\.\d+)\s+-\s+(.+?)\s{2,}([\d.]+)\s+([\w]{1,5})\s+([\d,.]+)\s+(\d+)\s+([\d,.]+)$/,
  );
  if (!match) return null;
  const costoUnitario = parseFloat(match[5].replace(/,/g, ''));
  const factor = parseInt(match[6], 10);
  if (isNaN(costoUnitario) || isNaN(factor)) return null;
  return {
    codigoActividad: match[1],
    descripcion: match[2].trim(),
    unidad: match[4],
    costoUnitario,
    factor,
  };
}

/**
 * Detects insumo lines that should be skipped.
 */
export function isLineaInsumo(line: string): boolean {
  return /^2-\d+/.test(line) || /^Elemento:/i.test(line);
}
