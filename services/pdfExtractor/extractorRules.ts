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
    .replace(/\s*Page\s+\d+\s+of\s+\d+\s*/gi, '')
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
 * Limpia un candidato de contratista removiendo texto de "fondo de garantia".
 * Hermes-safe: no lookbehind, no named groups.
 */
function cleanCandidateContratista(raw: string): string {
  const s = raw.trim();
  // Tomar lo que viene ANTES de "fondo de garantia"
  const beforeIdx = s.search(/\s+[Ff]ondo\s+de\s+garant/i);
  if (beforeIdx > 2) {
    return s.substring(0, beforeIdx).trim().substring(0, 80);
  }
  // Si empieza con "fondo de garantia", tomar lo que viene despues del porcentaje
  const afterMatch = s.match(/^[Ff]ondo\s+de\s+garant[ií]a\s*[\d.]*\s*%?\s*(.+)/i);
  if (afterMatch) {
    return afterMatch[1].trim().substring(0, 80);
  }
  return s.substring(0, 80);
}

/**
 * Extract the contractor name from the "Alcance detallado" section ONLY.
 * Tries multiple patterns in priority order; returns the first match.
 * Max 80 chars. Hermes-safe: no lookbehind, no named groups.
 *
 * NOTE: alcanceBuffer is space-joined (no newlines), so all patterns use
 * single-line matching. The buffer looks like:
 *   "...Contratista NOMBRE EMPRESA S.A. DE C.V. Fondo de garantia 5 %..."
 */
export function extractContratista(text: string): string | null {
  if (!text) return null;

  // Pattern 0: Hermes-safe — sin lookahead
  const p0 = text.match(/[Cc]ontratista\s*:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.,]+?)(?:\s*\d+\s*%|\s*[Ff]ondo|\s*[Mm]onto|\s*[Pp]rototipo)/i);
  if (p0) {
    const candidate = cleanCandidateContratista(collapseLine(p0[1]));
    if (candidate && candidate.length >= 3 && !/JAVER/i.test(candidate)) {
      return candidate;
    }
  }

  // Pattern 1: "Contratista" (with optional colon) ... "Fondo de garantia"
  // This is the most reliable anchor pair in the new PDF format.
  const p1 = text.match(/[Cc]ontratista\s*:?\s+(.+?)\s+[Ff]ondo\s+de\s+garant[ií]a/);
  if (p1) {
    const candidate = collapseLine(p1[1]);
    if (candidate && candidate.length >= 3 && !/JAVER/i.test(candidate)) {
      return cleanCandidateContratista(candidate);
    }
  }

  // Pattern 2: "CONTRATISTA" ... "APODERADO LEGAL" (old format)
  const p2 = text.match(/CONTRATISTA\s*:?\s+(.+?)\s*APODERADO\s+LEGAL/);
  if (p2) {
    const candidate = collapseLine(p2[1]);
    if (candidate && candidate.length >= 3 && !/JAVER/i.test(candidate)) {
      return cleanCandidateContratista(candidate);
    }
  }

  // Pattern 3: "Contratista" (with optional colon) ... "Monto contratado"
  // Some PDFs use Monto contratado as the next field after contractor name.
  const p3 = text.match(/[Cc]ontratista\s*:?\s+(.+?)\s+[Mm]onto\s+contratado/);
  if (p3) {
    const candidate = collapseLine(p3[1]);
    if (candidate && candidate.length >= 3 && !/JAVER/i.test(candidate)) {
      return cleanCandidateContratista(candidate);
    }
  }

  // Pattern 4: "Contratista" (with optional colon) followed by an uppercase name
  // (at least 3 chars of uppercase/accented/spaces/dots before the next known keyword).
  // Terminates at common section keywords or end of buffer.
  const p4 = text.match(/[Cc]ontratista\s*:?\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.,]+(?:S\.?\s*A\.?\s*(?:DE\s+C\.?\s*V\.?)?|S\.?\s*C\.?|S\.?\s*DE\s+R\.?\s*L\.?)?)/);
  if (p4) {
    const candidate = collapseLine(p4[1]);
    if (candidate && candidate.length >= 3 && !/JAVER/i.test(candidate)) {
      return cleanCandidateContratista(candidate);
    }
  }

  // Pattern 5: Broader uppercase name after "Contratista" — grab up to 80 chars
  // of uppercase text (letters, spaces, dots, commas, accents).
  const p5 = text.match(/[Cc]ontratista\s*:?\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.,'()-]{2,79})/);
  if (p5) {
    const candidate = collapseLine(p5[1]);
    if (candidate && candidate.length >= 3 && !/JAVER/i.test(candidate)) {
      return cleanCandidateContratista(candidate);
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
 * Extract the contract number. Supports multiple JAVER formats and generic patterns.
 */
export function extractNumeroContrato(text: string): string | null {
  // Pattern 1: MX-EDI-COV-XXXXXX (formato estandar JAVER, sufijos opcionales)
  const m1 = text.match(/MX-EDI-COV-\d+(?:[-_][A-Z0-9]+)*/i);
  if (m1) return m1[0].toUpperCase();

  // Pattern 2: MX-XXX-XXX-XXXXXX (variantes JAVER con prefijo distinto)
  const m2 = text.match(/MX-[A-Z]{2,5}-[A-Z]{2,5}-\d{4,}(?:[-_][A-Z0-9]+)*/i);
  if (m2) return m2[0].toUpperCase();

  // Pattern 3: "Numero de contrato: XXXXXXX"
  const m3 = text.match(/[Nn][úu]m(?:ero)?\s*\.?\s*(?:de\s+)?[Cc]ontrato\s*:?\s*([A-Z0-9][A-Z0-9\-_\/]{3,})/i);
  if (m3) return m3[1].toUpperCase();

  // Pattern 4: Codigo con 3+ segmentos alfanumericos separados por guion
  const m4 = text.match(/\b([A-Z]{2,6}-[A-Z0-9]{2,}-[A-Z0-9]{3,}(?:-[A-Z0-9]+)*)\b/i);
  if (m4) return m4[1].toUpperCase();

  return null;
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
 * Extract frente (numero + nombre) from alcance detallado.
 *
 * Formatos admitidos en el buffer space-joined (sin newlines):
 *   "Frente 01 - FRENTE 01 EDIFICACION ..."
 *   "FRENTE 61 PLATAFORMAS ..."
 *   "Frente 7 EDIFICACION ..."
 *
 * Hermes-safe: sin lookahead/lookbehind, sin named groups, sin flag `m`,
 * sin ancla `^`. El grupo no-capturante al final consume el delimitador,
 * y el match[2] queda recortado a sólo el nombre por la captura no-greedy.
 */
export function extractFrenteFromAlcance(
  text: string,
): { numero: string; nombre: string } | null {
  if (!text) return null;
  const match = text.match(
    /[Ff]rente\s+(\d+)\s*[-–—]?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9\s\.\-]{2,60}?)(?:\s{2,}|\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]|\s+\d+\s*%|$)/,
  );
  if (!match) return null;
  const numero = match[1].trim();
  const nombre = match[2].trim();
  if (!numero || !nombre) return null;
  return { numero, nombre };
}

/**
 * Extract fondo de garantía percentage.
 * Formatos admitidos:
 *   "Fondo de garantía 5 %"
 *   "FONDO DE GARANTÍA: 5%"
 *   "Fondo de garantia - 2.5%"
 * Hermes-safe: sin lookahead/lookbehind, sin named groups.
 */
export function extractFondoGarantia(text: string): number | null {
  const match = text.match(
    /Fondo\s+de\s+garant[ií]a\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i,
  );
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
 * Detects a vivienda separator line. Pattern: A01 - VIV. / A01-VIV / A 01 - VIV.
 * Returns the group number ("01", "02") or null.
 */
export function isSeparadorViv(line: string): string | null {
  const match = line.match(/^A\s*(\d{2})\s*[-–]\s*VIV/i);
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
 * Primary: uses 2+ space gaps as column separator (pdfjs default).
 * Fallback: uses 1+ space separator with right-anchored validation
 * to recover lines where pdfjs collapses column gaps to single space.
 */
export function parseLineaActividad(line: string): ConceptoRaw | null {
  // Attempt 1: classic 2+ space column separator
  const primary = /^(\d+\.\d+\.\d+)\s+-\s+(.+?)\s{2,}([\d.]+)\s+([\w]{1,6})\s+([\d,.]+)\s+(\d+)\s+([\d,.]+)$/.exec(line);
  if (primary) {
    const costoUnitario = parseFloat(primary[5].replace(/,/g, ''));
    const factor = parseInt(primary[6], 10);
    if (!isNaN(costoUnitario) && !isNaN(factor) && factor > 0) {
      return {
        codigoActividad: primary[1],
        descripcion: primary[2].trim(),
        unidad: primary[4],
        costoUnitario,
        factor,
      };
    }
  }

  // Attempt 2: fallback with 1+ space separator, validated by right-anchor sanity checks
  const fallback = /^(\d+\.\d+\.\d+)\s+-\s+(.+?)\s+([\d.]+)\s+([\w]{1,6})\s+([\d,.]+)\s+(\d+)\s+([\d,.]+)$/.exec(line);
  if (fallback) {
    const costoUnitario = parseFloat(fallback[5].replace(/,/g, ''));
    const factor = parseInt(fallback[6], 10);
    if (!isNaN(costoUnitario) && costoUnitario > 0 && !isNaN(factor) && factor > 0 && factor <= 10000) {
      return {
        codigoActividad: fallback[1],
        descripcion: fallback[2].trim(),
        unidad: fallback[4],
        costoUnitario,
        factor,
      };
    }
  }

  return null;
}

/**
 * Detects insumo lines that should be skipped.
 */
export function isLineaInsumo(line: string): boolean {
  return /^2-\d+/.test(line) || /^Elemento:/i.test(line);
}
