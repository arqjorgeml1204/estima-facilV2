/**
 * index.ts
 * Barrel re-export for the pdfExtractor module.
 * Import everything consumers need from this single entry point.
 */

// Types
export type { ConceptoRaw, Concepto, ContratoExtraido, ExtractionErrorCode } from './types';

// Enum
export { ParserState } from './types';

// Error class
export { ExtractionError } from './types';

// Extractor class
export { PdfDeterministicExtractor } from './PdfDeterministicExtractor';

// Extraction rules (regex detectors and parsers)
export * from './extractorRules';
