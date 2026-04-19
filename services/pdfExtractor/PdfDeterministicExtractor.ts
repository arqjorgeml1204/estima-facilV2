/**
 * PdfDeterministicExtractor.ts
 *
 * Text extraction is delegated to PdfWebViewBridge, which runs pdfjs-dist
 * inside the device's WebView browser engine — bypassing the Hermes JS engine
 * restriction that caused pdfjs to crash on module initialisation.
 *
 * The state machine (processLine / buildResult / validate) is unchanged.
 * File I/O is performed through expo-file-system (base64).
 */

import * as FileSystem from 'expo-file-system/legacy';

import {
  Concepto,
  ContratoExtraido,
  ExtractionError,
  ParserState,
} from './types';

import {
  cleanLine,
  collapseLine,
  extractContratista,
  extractConjunto,
  extractNumeroContrato,
  extractDescripcionObra,
  extractMonto,
  extractFrenteFromAlcance,
  extractFondoGarantia,
  isStopRule,
  isTablaHeader,
  isPrototipo,
  isSeparadorViv,
  isPaquete,
  isSubpaquete,
  parseLineaActividad,
  isLineaInsumo,
} from './extractorRules';

import type { PdfBridgeRef } from './PdfWebViewBridge';

// ─── Parser context ───────────────────────────────────────────────────────────

/**
 * Mutable accumulator that is threaded through every page and line of the PDF.
 * Initialised once in `extract()` and mutated by `processLine()`.
 */
interface ParserContext {
  contratista: string | null;
  conjunto: string | null;
  numeroContrato: string | null;
  descripcionObra: string | null;
  montoContrato: number | null;
  frente: string | null;
  fondoGarantia: number | null;
  prototipoActual: string | null;
  paqueteActual: string | null;
  subpaqueteActual: string | null;
  /**
   * Key = codigoActividad (e.g. "4.10.0002").
   * Concepts are upserted here as lines are processed; factorTotal is
   * accumulated across A0X group rows for the same activity code.
   */
  conceptosMap: Map<string, Concepto>;
  currentState: ParserState;
  /** Accumulated header text across pages for header field extraction. */
  headerBuffer: string;
  /** Accumulated "Alcance detallado" section text for conjunto extraction. */
  alcanceBuffer: string;
}

// ─── Extractor class ──────────────────────────────────────────────────────────

// ─── Helper: trim descripcionObra to canonical range ─────────────────────────

function trimDescripcion(raw: string): string {
  const startMatch = raw.search(/EDIFICACI[OÓ]N\s+DE\s+\d+/i);
  const endRegex = /DEL\s+FRACCIONAMIENTO\s+[A-ZÁÉÍÓÚÜÑ0-9 ]+/i;
  const endResult = endRegex.exec(raw);
  if (startMatch >= 0 && endResult) {
    return raw.substring(startMatch, endResult.index + endResult[0].length).trim();
  }
  return raw;
}

export class PdfDeterministicExtractor {
  private bridge: PdfBridgeRef;

  /**
   * @param bridge - A mounted PdfWebViewBridge ref that handles pdfjs text extraction.
   */
  constructor(bridge: PdfBridgeRef) {
    this.bridge = bridge;
  }

  /**
   * Main entry point. Reads the PDF at `pdfUri` as base64, sends it to the
   * WebView bridge for text extraction, then runs the state machine over the
   * returned lines to produce a fully validated ContratoExtraido.
   *
   * @param pdfUri - Expo FileSystem URI (e.g. file:///…/contrato.pdf)
   * @returns Parsed contract data ready for persistence.
   * @throws {ExtractionError} with an appropriate ExtractionErrorCode when
   *   the PDF is protected, image-only, has an incomplete header, or yields
   *   an incomplete extraction.
   */
  async extract(pdfUri: string): Promise<ContratoExtraido> {
    // ── 1. Read PDF as base64 via Expo FileSystem ──────────────────────────
    const base64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: 'base64',
    });

    // ── 2. Extract text lines via WebView / pdfjs bridge ──────────────────
    let lines: string[];
    try {
      lines = await this.bridge.extractText(base64);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Surface password-protected PDFs if pdfjs reports it
      if (/password/i.test(msg)) {
        throw new ExtractionError('PDF_PROTEGIDO', 'El PDF requiere contraseña.');
      }
      throw err;
    }

    // ── 3. Scanned / empty PDF guard ──────────────────────────────────────
    if (lines.length === 0) {
      throw new ExtractionError(
        'PDF_ESCANEADO',
        'El PDF no contiene texto extraíble (posiblemente escaneado).',
      );
    }

    // Quick check: if the first 20 lines together have fewer than 50 chars,
    // treat as scanned (mirrors the original page-1 guard).
    const earlyText = lines.slice(0, 20).join(' ');
    if (earlyText.trim().length < 50) {
      throw new ExtractionError(
        'PDF_ESCANEADO',
        'El PDF no contiene texto extraíble (posiblemente escaneado).',
      );
    }

    // ── 4. Run state machine over all lines ───────────────────────────────
    const context: ParserContext = {
      contratista: null,
      conjunto: null,
      numeroContrato: null,
      descripcionObra: null,
      montoContrato: null,
      frente: null,
      fondoGarantia: null,
      prototipoActual: null,
      paqueteActual: null,
      subpaqueteActual: null,
      conceptosMap: new Map(),
      currentState: ParserState.LEYENDO_ENCABEZADO,
      headerBuffer: '',
      alcanceBuffer: '',
    };

    for (const rawLine of lines) {
      const line = cleanLine(rawLine);
      if (!line) continue;
      context.currentState = this.processLine(line, context.currentState, context);
      if (context.currentState === ParserState.FINALIZADO) break;
    }

    const result = this.buildResult(context);
    this.validate(result);
    return result;
  }

  /**
   * Processes a single text line within the state machine, mutating `context`
   * and returning the (potentially new) parser state.
   *
   * @param line - A single trimmed text line from the PDF.
   * @param state - The current parser state before processing this line.
   * @param context - Mutable accumulator; modified in place.
   * @returns The parser state after processing the line.
   */
  private processLine(
    line: string,
    state: ParserState,
    context: ParserContext,
  ): ParserState {
    switch (state) {
      case ParserState.LEYENDO_ENCABEZADO: {
        context.headerBuffer += ' ' + line;

        // Detect transition to alcance detallado section
        if (/alcance\s+detallado\s+de[l]?\s+contrato/i.test(line)) {
          return ParserState.ESPERANDO_ALCANCE_DETALLADO;
        }

        return ParserState.LEYENDO_ENCABEZADO;
      }

      case ParserState.ESPERANDO_ALCANCE_DETALLADO: {
        context.alcanceBuffer += ' ' + line;

        // Extract ALL fields from the alcance buffer
        if (!context.frente) {
          context.frente = extractFrenteFromAlcance(context.alcanceBuffer);
        }
        if (!context.conjunto) {
          context.conjunto = extractConjunto(context.alcanceBuffer);
        }
        if (!context.numeroContrato) {
          context.numeroContrato = extractNumeroContrato(context.alcanceBuffer);
        }
        if (!context.contratista) {
          context.contratista = extractContratista(context.alcanceBuffer);
        }
        if (context.fondoGarantia == null) {
          context.fondoGarantia = extractFondoGarantia(context.alcanceBuffer);
        }
        if (context.montoContrato == null) {
          context.montoContrato = extractMonto(context.alcanceBuffer);
        }
        if (!context.descripcionObra) {
          context.descripcionObra = extractDescripcionObra(context.alcanceBuffer);
        }

        // Detect table header → transition to reading concepts
        if (isTablaHeader(line)) {
          return ParserState.LEYENDO_CONCEPTOS;
        }

        return ParserState.ESPERANDO_ALCANCE_DETALLADO;
      }

      case ParserState.LEYENDO_CONCEPTOS: {
        // 1. Stop rule — MUST be first
        if (isStopRule(line)) {
          return ParserState.FINALIZADO;
        }

        // 2. Insumo line — skip
        if (isLineaInsumo(line)) {
          return ParserState.LEYENDO_CONCEPTOS;
        }

        // 3. Prototype
        const proto = isPrototipo(line);
        if (proto) {
          context.prototipoActual = proto;
          return ParserState.LEYENDO_CONCEPTOS;
        }

        // 4. Vivienda separator — skip
        if (isSeparadorViv(line) !== null) {
          return ParserState.LEYENDO_CONCEPTOS;
        }

        // 5. Paquete
        const paq = isPaquete(line);
        if (paq) {
          context.paqueteActual = paq;
          context.subpaqueteActual = null;
          return ParserState.LEYENDO_CONCEPTOS;
        }

        // 6. Subpaquete
        const subpaq = isSubpaquete(line);
        if (subpaq) {
          context.subpaqueteActual = subpaq;
          return ParserState.LEYENDO_CONCEPTOS;
        }

        // 7. Activity line → upsert into conceptosMap
        const raw = parseLineaActividad(line);
        if (raw) {
          // Bug fix: la clave de agrupación debe incluir paquete y sub-paquete,
          // no sólo codigoActividad. El PDF JAVER puede repetir el mismo
          // codigoActividad bajo sub-paquetes distintos (p. ej. "ZOCLO PB" en
          // sub-paquete 397 y "ZOCLO 1ER NIVEL" en sub-paquete 398). Antes se
          // fusionaban en un solo concepto y se duplicaba factorTotal (2X casas).
          // Ahora cada (paquete, subpaquete, codigoActividad) es único.
          const paqKey = context.paqueteActual || '';
          const subKey = context.subpaqueteActual || '';
          const key = `${paqKey}||${subKey}||${raw.codigoActividad}`;
          const existing = context.conceptosMap.get(key);

          if (existing) {
            existing.factorTotal += raw.factor;
            if (
              context.prototipoActual &&
              !existing.prototipos.includes(context.prototipoActual)
            ) {
              existing.prototipos.push(context.prototipoActual);
            }
          } else {
            const concepto: Concepto = {
              prototipos: context.prototipoActual
                ? [context.prototipoActual]
                : [],
              paquete: context.paqueteActual,
              subpaquete: context.subpaqueteActual,
              actividad: `${raw.codigoActividad} - ${raw.descripcion}`,
              unidad: raw.unidad || null,
              costoUnitario: raw.costoUnitario,
              factorTotal: raw.factor,
            };
            context.conceptosMap.set(key, concepto);
          }
          return ParserState.LEYENDO_CONCEPTOS;
        }

        return ParserState.LEYENDO_CONCEPTOS;
      }

      case ParserState.FINALIZADO:
        return ParserState.FINALIZADO;

      default:
        return state;
    }
  }

  /**
   * Converts the fully accumulated `ParserContext` into a `ContratoExtraido`.
   * Flattens `conceptosMap` values into an ordered array, preserving the
   * document order established during line processing.
   */
  private buildResult(context: ParserContext): ContratoExtraido {
    // Contratista: primary source is alcanceBuffer (set during state machine).
    // Fallback 1: re-run extractContratista on the full alcanceBuffer (may
    //   succeed if more text accumulated after the last incremental attempt).
    // Fallback 2: keyword-based search in alcanceBuffer.
    // Fallback 3 (last resort): try extractContratista on headerBuffer,
    //   only if alcanceBuffer produced nothing.
    let contratista = context.contratista;
    if (!contratista) {
      contratista = extractContratista(context.alcanceBuffer);
    }
    if (!contratista) {
      contratista = this.extractContratistaFallback(context.alcanceBuffer);
    }
    if (!contratista && context.headerBuffer) {
      contratista = extractContratista(context.headerBuffer);
    }

    let descripcionObra = context.descripcionObra;
    if (!descripcionObra) {
      descripcionObra = extractDescripcionObra(context.headerBuffer);
    }

    // Fallback for numeroContrato / monto from header if alcance missed them
    const numeroContrato = (context.numeroContrato
      || extractNumeroContrato(context.headerBuffer))
      ?? `CONT-${Date.now()}`;
    const montoContrato = context.montoContrato
      ?? extractMonto(context.headerBuffer);

    return {
      contratista,
      conjunto: context.conjunto,
      numeroContrato,
      descripcionObra: trimDescripcion(descripcionObra ?? ''),
      montoContrato,
      frente: context.frente,
      fondoGarantia: context.fondoGarantia,
      conceptos: Array.from(context.conceptosMap.values()),
    };
  }

  /**
   * Last-resort contratista extraction: searches the buffer (which may be a
   * single space-joined string with no newlines) for keyword:value patterns
   * like "contratista:", "empresa contratista:", "razón social:".
   * Hermes-safe: no named groups, no lookbehind.
   */
  private extractContratistaFallback(buffer: string): string | null {
    if (!buffer) return null;

    // The buffer is space-joined (no newlines), so use regex to find
    // keyword + colon + value. Value terminates at next known keyword or
    // runs of lowercase text that indicate a new field.
    const patterns = [
      /[Ee]mpresa\s+[Cc]ontratista\s*:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.,'()-]{2,79})/,
      /[Rr]az[oó]n\s+[Ss]ocial\s*:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.,'()-]{2,79})/,
      /[Cc]ontratista\s*:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.,'()-]{2,79})/,
    ];

    for (const re of patterns) {
      const match = buffer.match(re);
      if (match) {
        const candidate = collapseLine(match[1]);
        if (candidate && candidate.length >= 3 && !/JAVER/i.test(candidate)) {
          return candidate.substring(0, 80);
        }
      }
    }

    return null;
  }

  /**
   * Validates the extracted result before it is returned to the caller.
   * Throws on the first validation failure found.
   */
  private validate(result: ContratoExtraido): void {
    // numeroContrato ya tiene fallback en buildResult, no se valida
    if (result.conjunto == null) {
      throw new ExtractionError(
        'ENCABEZADO_INCOMPLETO',
        'No se encontró el conjunto.',
        'conjunto',
      );
    }
    if (result.montoContrato == null || result.montoContrato <= 0) {
      throw new ExtractionError(
        'ENCABEZADO_INCOMPLETO',
        'Monto del contrato inválido.',
        'montoContrato',
      );
    }
    if (result.conceptos.length === 0) {
      throw new ExtractionError(
        'EXTRACCION_INCOMPLETA',
        'No se encontraron conceptos en el PDF.',
        'conceptos',
      );
    }
    for (const c of result.conceptos) {
      if (!c.actividad) {
        throw new ExtractionError('EXTRACCION_INCOMPLETA', 'Concepto sin actividad.', 'actividad');
      }
      if (c.factorTotal <= 0) {
        throw new ExtractionError('EXTRACCION_INCOMPLETA', 'Concepto con factorTotal inválido.', 'factorTotal');
      }
    }
  }
}
