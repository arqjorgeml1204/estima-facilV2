/**
 * pdfExtractor.ts
 * Extrae información estructurada de contratos JAVER usando Claude API.
 * Solo procesa: Página 1, 6 y 7-18 (A01 únicamente).
 * Se detiene en: "A02 - VIV." o "Explosion de insumos"
 */

import Anthropic from '@anthropic-ai/sdk';
import * as FileSystem from 'expo-file-system';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ConceptoExtraido {
  actividad: string;        // "4.10.0002"
  descripcion: string;      // "TRAZO Y NIVELACION DEL TERRENO"
  unidad: string;           // "LOT" | "M2" | "ML" | "M3" | "PZA" etc.
  costoUnitario: number;    // 138.15
  factor: number;           // 5 (por sección A01)
  paquete: string;          // "PRELIMINARES"
  subpaquete: string;       // "TRAZO Y NIVELACIÓN DEL TERRENO"
}

export interface ContratoExtraido {
  // Página 1
  contratista: string;        // "GSD CONSTRUCCIONES SA DE CV"
  montoContrato: number;      // 3083609.80

  // Página 6
  conjunto: string;           // "D38-01-C03-18"
  numeroContrato: string;     // "MX-EDI-COV-168827"
  totalVerificado: number;    // debe coincidir con montoContrato

  // Página 7
  notas: string;              // Descripción del contrato para el reporte
  prototipo: string;          // "EDIF-5000"
  fechaInicio: string;        // "11-AGO-2025"
  fechaTerminacion: string;   // "07-AGO-2026"
  totalUnidades: number;      // 20 (4 secciones × 5)

  // Páginas 7-18 (solo A01)
  conceptos: ConceptoExtraido[];
}

// ─── Prompt quirúrgico ────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `Eres un extractor de datos de contratos de construcción JAVER.
Extraes ÚNICAMENTE la información especificada. No inventes datos ni rellenes con valores por defecto.
Devuelves SOLO JSON válido, sin texto adicional, sin markdown.`;

const buildExtractionPrompt = () => `
Analiza este contrato PDF y extrae EXACTAMENTE la siguiente información:

## PÁGINA 1 (Carátula del contrato):
- CONTRATISTA: busca la línea "CONTRATISTA [nombre]" — extrae el nombre completo
- CONTRAPRESTACIÓN: busca "$X,XXX,XXX.XX M.N." — extrae solo el número

## PÁGINA 6 (Alcance de contrato por paquete):
- CONJUNTO: busca "Conjunto [código] -" — extrae el código formato "D##-##-C##-##"
- CONTRATO: busca "Contrato [número] -" — extrae el número formato "MX-EDI-COV-######"
- TOTAL_CONTRATO: busca "Total Contrato () [monto]" — extrae el número para verificar

## PÁGINA 7 (Alcance detallado):
- NOTAS: busca la línea "Notas [texto...]" — extrae TODO el texto de esa línea (es la descripción del contrato)
- PROTOTIPO: busca "Prototipos (1) [código]" — extrae el código (ej: "EDIF-5000")
- FECHA_INICIO: busca "Fecha de inicio [fecha]" — extrae en formato original
- FECHA_TERMINACION: busca "Fecha de terminación [fecha]" — extrae en formato original

## CONCEPTOS (Solo sección A01, páginas 7 en adelante):
Extrae TODOS los conceptos de la sección A01. Cada concepto tiene este formato en el texto:
"4.XX.XXXX - NOMBRE 1.0000 UNIDAD COSTO FACTOR TOTAL"

Para cada concepto extrae:
- actividad: código "4.XX.XXXX"
- descripcion: nombre del concepto
- unidad: LOT / M2 / ML / M3 / PZA / VDA / KG / VIAJE / JGO / TAND / PA
- costoUnitario: el número antes del FACTOR
- factor: número (normalmente 5)
- paquete: la sección padre (ej: "PRELIMINARES", "CIMENTACIÓN", etc.) — viene en líneas "## - NOMBRE"
- subpaquete: la subsección (ej: "TRAZO Y NIVELACIÓN DEL TERRENO") — viene en líneas "### - NOMBRE"

REGLA CRÍTICA: Detente cuando encuentres "A02 - VIV." o "Explosion de insumos".
El total de unidades = número de secciones (A01, A02, A03, A04 = 4) × factor (5) = 20.

## FORMATO DE RESPUESTA (JSON puro):
{
  "contratista": "...",
  "montoContrato": 0.00,
  "conjunto": "...",
  "numeroContrato": "...",
  "totalVerificado": 0.00,
  "notas": "...",
  "prototipo": "...",
  "fechaInicio": "...",
  "fechaTerminacion": "...",
  "totalUnidades": 20,
  "conceptos": [
    {
      "actividad": "4.10.0002",
      "descripcion": "TRAZO Y NIVELACION DEL TERRENO",
      "unidad": "LOT",
      "costoUnitario": 138.15,
      "factor": 5,
      "paquete": "PRELIMINARES",
      "subpaquete": "TRAZO Y NIVELACIÓN DEL TERRENO"
    }
  ]
}
`;

// ─── Servicio principal ───────────────────────────────────────────────────────

export class PdfExtractorService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Extrae datos estructurados de un contrato JAVER.
   * @param pdfUri URI local del archivo PDF (desde expo-document-picker)
   */
  async extractFromContract(pdfUri: string): Promise<ContratoExtraido> {
    // 1. Leer PDF como base64
    const base64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 2. Llamar a Claude con el PDF completo (Haiku = rápido y barato)
    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            {
              type: 'text',
              text: buildExtractionPrompt(),
            },
          ],
        },
      ],
    });

    // 3. Parsear respuesta JSON
    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const data = JSON.parse(jsonText) as ContratoExtraido;

    // 4. Validación básica
    this.validate(data);

    return data;
  }

  private validate(data: ContratoExtraido): void {
    if (!data.contratista) throw new Error('No se encontró el CONTRATISTA en la página 1');
    if (!data.montoContrato || data.montoContrato <= 0) throw new Error('No se encontró CONTRAPRESTACIÓN válida');
    if (!data.conjunto) throw new Error('No se encontró CONJUNTO en la página 6');
    if (!data.numeroContrato) throw new Error('No se encontró número de CONTRATO en la página 6');
    if (!data.conceptos || data.conceptos.length === 0) throw new Error('No se extrajeron conceptos de la página 7');

    // Verificar que montoContrato y totalVerificado coincidan (tolerancia 1 peso)
    const diff = Math.abs(data.montoContrato - data.totalVerificado);
    if (diff > 1) {
      console.warn(`⚠️ Diferencia entre carátula (${data.montoContrato}) y total pág.6 (${data.totalVerificado}): $${diff}`);
    }
  }
}
