/**
 * pdf/soporte/[id].tsx
 * Pantalla 2: Soporte de Estimación — genera y exporta PDF oficial.
 * Cambio 8: Replica formato FORMATO_ESTIMA_FACIL.xlsx (landscape, Excel-style)
 */

import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import {
  initDatabase, getEstimacionById, getProyectoById,
  getDetallesByEstimacion, getEmpresa,
  getEvidenciasByEstimacion, getCroquisByEstimacion,
  getConceptosByProyecto,
} from '../../../db/database';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface RowData {
  actividad: string;
  descripcion: string;
  unidad: string;
  cantidad_anterior: number;
  cantidad_esta_est: number;
  cantidad_acumulada: number;
  importe_anterior: number;
  importe_esta_est: number;
  importe_acumulado: number;
  avance_financiero: number;
  costo_unitario: number;
  factor: number;
}

interface GroupedRow {
  actividad: string;
  descripcion: string;
  unidad: string;
  costo_unitario: number;
  factor: number;
  paquete: string;
  subpaquete: string;
  ant: number;
  estaEstBase: number;
}

interface ComputedRow extends GroupedRow {
  estaEst: number;
  acum: number;
  importeContrato: number;
  importeAnt: number;
  importeEstaEst: number;
  importeAcum: number;
  avance: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const NUM_TEXT: Record<number, string> = {
  1: 'UNO', 2: 'DOS', 3: 'TRES', 4: 'CUATRO', 5: 'CINCO',
  6: 'SEIS', 7: 'SIETE', 8: 'OCHO', 9: 'NUEVE', 10: 'DIEZ',
  11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
  16: 'DIECISÉIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE', 20: 'VEINTE',
  21: 'VEINTIUNO', 22: 'VEINTIDÓS', 23: 'VEINTITRÉS', 24: 'VEINTICUATRO', 25: 'VEINTICINCO',
};

function getISOWeek(d: Date): number {
  const date = new Date(d);
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000
    - 3 + (week1.getDay() + 6) % 7) / 7);
}

function getWeekMondayAndSaturday(): { lunes: Date; sabado: Date } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const lunes = new Date(now);
  lunes.setDate(now.getDate() + diffToMonday);
  const sabado = new Date(lunes);
  sabado.setDate(lunes.getDate() + 5);
  return { lunes, sabado };
}

function formatPeriodo(lunes: Date, sabado: Date): string {
  const dL = lunes.getDate();
  const dS = sabado.getDate();
  if (lunes.getMonth() === sabado.getMonth()) {
    return `del ${dL} al ${dS} de ${MESES[sabado.getMonth()]} del ${sabado.getFullYear()}`;
  }
  return `del ${dL} de ${MESES[lunes.getMonth()]} al ${dS} de ${MESES[sabado.getMonth()]} del ${sabado.getFullYear()}`;
}

// ── Landscape page dimensions (Letter) ────────────────────────────────────────
const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;

export default function PdfSoporte() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [estimacion, setEstimacion] = useState<any>(null);
  const [proyecto, setProyecto] = useState<any>(null);
  const [empresa, setEmpresa] = useState<any>(null);
  const [detalles, setDetalles] = useState<RowData[]>([]);
  const [conceptos, setConceptos] = useState<any[]>([]);
  const [evidencias, setEvidencias] = useState<any[]>([]);
  const [croquisList, setCroquisList] = useState<any[]>([]);
  const [editedEstaEst, setEditedEstaEst] = useState<Record<string, string>>({});
  const [editingActividad, setEditingActividad] = useState<string | null>(null);
  const [obraAsync, setObraAsync] = useState<string>('VISTAS DEL NEVADO');
  const [frenteAsync, setFrenteAsync] = useState<string>('FRENTE 01');
  const [retencion, setRetencion] = useState<number>(5);
  const [retencionText, setRetencionText] = useState<string>('5');
  const [evidenciasBase64, setEvidenciasBase64] = useState<Record<string, string>>({});
  const [croquisBase64, setCroquisBase64] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        // Leer obra y frente desde AsyncStorage
        const obraVal = await AsyncStorage.getItem('obra');
        const frenteVal = await AsyncStorage.getItem('frente');
        if (obraVal) setObraAsync(obraVal);
        if (frenteVal) setFrenteAsync(frenteVal);
        const est = await getEstimacionById(Number(id));
        if (!est) { setLoading(false); return; }
        const [proy, emp, rows, evs, cros] = await Promise.all([
          getProyectoById(est.proyecto_id),
          getEmpresa(),
          getDetallesByEstimacion(Number(id)),
          getEvidenciasByEstimacion(Number(id)),
          getCroquisByEstimacion(Number(id)),
        ]);
        const conceptosData = proy ? await getConceptosByProyecto(proy.id) : [];
        setEstimacion(est);
        setProyecto(proy);
        setEmpresa(emp);
        setDetalles(rows as RowData[]);
        setConceptos(conceptosData);
        setEvidencias(evs as any[]);
        setCroquisList(cros as any[]);
      } catch (e) {
        console.error('[PdfSoporte] load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Cargar fotos como base64 cuando evidencias cambian ──────────────────────
  useEffect(() => {
    if (evidencias.length === 0) return;
    (async () => {
      const map: Record<string, string> = {};
      for (const ev of evidencias) {
        try {
          const info = await FileSystem.getInfoAsync(ev.imagen_uri);
          if (info.exists) {
            const b64 = await FileSystem.readAsStringAsync(ev.imagen_uri, { encoding: 'base64' as any });
            map[ev.id] = b64;
          }
        } catch (e) {
          console.warn('[PdfSoporte] No se pudo leer imagen evidencia:', ev.id, e);
        }
      }
      setEvidenciasBase64(map);
    })();
  }, [evidencias]);

  // ── Cargar croquis como base64 cuando croquisList cambia ─────────────────────
  useEffect(() => {
    if (croquisList.length === 0) return;
    (async () => {
      const map: Record<string, string> = {};
      for (const c of croquisList) {
        try {
          const info = await FileSystem.getInfoAsync(c.imagen_uri);
          if (info.exists) {
            const b64 = await FileSystem.readAsStringAsync(c.imagen_uri, { encoding: 'base64' as any });
            map[c.id] = b64;
          }
        } catch (e) {
          console.warn('[PdfSoporte] No se pudo leer croquis:', c.id, e);
        }
      }
      setCroquisBase64(map);
    })();
  }, [croquisList]);

  // ── Lookup map: actividad → concepto (for paquete/subpaquete) ───────────────
  const conceptoMap: Record<string, any> = {};
  for (const c of conceptos) {
    conceptoMap[c.actividad] = c;
  }

  // ── Agrupar por actividad, sumar cantidades ─────────────────────────────────
  const groupedRows: GroupedRow[] = (() => {
    const map: Record<string, GroupedRow> = {};
    for (const d of detalles) {
      const key = d.actividad;
      if (!map[key]) {
        const cm = conceptoMap[d.actividad];
        map[key] = {
          actividad: d.actividad,
          descripcion: d.descripcion,
          unidad: d.unidad,
          costo_unitario: d.costo_unitario,
          factor: d.factor ?? cm?.factor ?? 0,
          paquete: cm?.paquete ?? '',
          subpaquete: cm?.subpaquete ?? '',
          ant: 0,
          estaEstBase: 0,
        };
      }
      map[key].ant += d.cantidad_anterior;
      map[key].estaEstBase += d.cantidad_esta_est;
    }
    return Object.values(map);
  })();

  // Aplicar overrides manuales y calcular derivados (#16: cap estaEst a factor)
  // BUG-1: Filtrar conceptos con importe del periodo actual = $0
  const computedRows: ComputedRow[] = groupedRows.map(g => {
    const rawEstaEst = editedEstaEst[g.actividad] !== undefined
      ? parseFloat(editedEstaEst[g.actividad]) || 0
      : g.estaEstBase;
    const maxAllowed = Math.max(0, g.factor - g.ant);
    const estaEst = Math.min(rawEstaEst, maxAllowed);
    const acum = g.ant + estaEst;
    const importeContrato = g.costo_unitario * g.factor;
    const importeAnt = g.ant * g.costo_unitario;
    const importeEstaEst = estaEst * g.costo_unitario;
    const importeAcum = importeAnt + importeEstaEst;
    const avance = importeContrato > 0
      ? (importeAcum / importeContrato) * 100
      : 0;
    return { ...g, estaEst, acum, importeContrato, importeAnt, importeEstaEst, importeAcum, avance };
  }).filter(r => r.importeEstaEst > 0);

  // Totales locales recalculados en tiempo real (#15: retención editable)
  const localSubtotal = computedRows.reduce((s, r) => s + r.importeEstaEst, 0);
  const retencionPct = Math.max(0, Math.min(100, retencion)) / 100;
  const localRetencion = localSubtotal * retencionPct;
  const localTotal = localSubtotal - localRetencion;

  // Header-level totals
  const estimadoAcumulado = computedRows.reduce((s, r) => s + r.importeAnt, 0);
  const porEstimar = Math.max(0, (proyecto?.monto_contrato ?? 0) - estimadoAcumulado - localSubtotal);

  // ── Contratista (extracted from proyecto.nombre "CONJUNTO — CONTRATISTA") ───
  const contratista = (() => {
    const n = proyecto?.nombre ?? '';
    const idx = n.indexOf(' — ');
    return idx >= 0 ? n.slice(idx + 3) : empresa?.nombre ?? '';
  })();

  // ── Periodo & semana (calculated fresh, Monday–Saturday) ────────────────────
  const now = new Date();
  const semana = getISOWeek(now);
  const { lunes, sabado } = getWeekMondayAndSaturday();
  const periodo = formatPeriodo(lunes, sabado);
  const fechaEst = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

  // ── buildHtml — replica FORMATO_ESTIMA_FACIL.xlsx ───────────────────────────
  const buildHtml = async () => {
    // Cargar logo JAVER como base64
    let logoSrc = '';
    try {
      const asset = Asset.fromModule(require('../../../assets/logo-javer.png'));
      await asset.downloadAsync();
      const logoBase64 = await FileSystem.readAsStringAsync(asset.localUri!, { encoding: 'base64' as any });
      logoSrc = `data:image/png;base64,${logoBase64}`;
    } catch (e) {
      logoSrc = '';
    }

    const montoContrato = proyecto?.monto_contrato ?? 0;
    const numEst = estimacion?.numero ?? 1;
    const numEstText = NUM_TEXT[numEst] ?? String(numEst);
    const prototipo = proyecto?.prototipo ?? '';
    const conjunto = proyecto?.conjunto ?? proyecto?.codigo ?? '';
    const contrato = proyecto?.numero_contrato ?? '';
    const frente = frenteAsync;
    const desarrolloRaw = obraAsync;
    const desarrollo = desarrolloRaw.length > 60 ? desarrolloRaw.slice(0, 60) + '...' : desarrolloRaw;

    // ── buildHeader: reutilizable para soporte, evidencia, croquis ──────────
    const buildHeader = (sectionTitle: string) => `
      <table class="hdr" cellspacing="0" cellpadding="0">
        <colgroup>
          <col style="width:5%"/>
          <col style="width:16%"/><col style="width:11%"/><col style="width:20%"/>
          <col style="width:12%"/><col style="width:6%"/><col style="width:6%"/><col style="width:24%"/>
        </colgroup>
        <tr style="height:20px">
          <td rowspan="4" style="width:120px; padding:4px; border:1px solid #ccc; text-align:center; vertical-align:middle;">${logoSrc ? `<img src="${logoSrc}" style="max-width:110px; max-height:50px; object-fit:contain;" />` : '<span style="font-size:14px; font-weight:bold; color:#003d9b;">JAVER</span>'}</td>
          <td class="hdr-title">DESARROLLO</td>
          <td class="hdr-title">FRENTE</td>
          <td class="hdr-title">CONJUNTO</td>
          <td class="hdr-title">FECHA DE ESTIMACION</td>
          <td colspan="2" class="hdr-title">NO. ESTIMACION</td>
          <td class="hdr-title">MONTO DE CONTRATO</td>
        </tr>
        <tr style="height:26px">
          <td class="hdr-val">${desarrollo}</td>
          <td class="hdr-val">${frente}</td>
          <td class="hdr-val">${conjunto}</td>
          <td class="hdr-val">${fechaEst}</td>
          <td class="hdr-val">${numEst}</td>
          <td class="hdr-val" style="font-size:7px">${numEstText}</td>
          <td class="hdr-val">$ ${fmt(montoContrato)}</td>
        </tr>
        <tr style="height:18px">
          <td class="hdr-title">CONTRATISTA</td>
          <td class="hdr-title">CONTRATO</td>
          <td class="hdr-title">PERIODO DE ESTIMACION</td>
          <td class="hdr-title">ESTIMADO ACUMULADO</td>
          <td colspan="2" class="hdr-title">ESTA ESTIMACIÓN</td>
          <td class="hdr-title">POR ESTIMAR</td>
        </tr>
        <tr style="height:24px">
          <td class="hdr-val" style="font-weight:800">${contratista}</td>
          <td class="hdr-val">${contrato}</td>
          <td class="hdr-val" style="font-size:7px">${periodo}</td>
          <td class="hdr-val">$ ${fmt(estimadoAcumulado)}</td>
          <td colspan="2" class="hdr-val">$ ${fmt(localSubtotal)}</td>
          <td class="hdr-val">$ ${fmt(porEstimar)}</td>
        </tr>
      </table>
      <table class="subtitle-tbl" cellspacing="0" cellpadding="0">
        <tr style="height:18px">
          <td class="subtitle-left">${sectionTitle}</td>
          <td class="subtitle-sem-label">SEMANA</td>
          <td class="subtitle-sem-val">${semana}</td>
        </tr>
      </table>`;

    // ── Descripción del contrato ────────────────────────────────────────────
    const descripcionHtml = proyecto?.descripcion_contrato
      ? `<table class="desc-tbl" cellspacing="0" cellpadding="0">
           <tr>
             <td class="desc-label">DESCRIPCION DEL CONTRATO</td>
             <td class="desc-val">${proyecto.descripcion_contrato}</td>
           </tr>
         </table>`
      : '';

    // ── Sort + group by paquete ─────────────────────────────────────────────
    const sorted = [...computedRows].sort((a, b) => {
      if (a.paquete !== b.paquete) return a.paquete.localeCompare(b.paquete);
      if (a.subpaquete !== b.subpaquete) return a.subpaquete.localeCompare(b.subpaquete);
      return a.actividad.localeCompare(b.actividad);
    });

    const paqueteGroups: { paquete: string; rows: ComputedRow[] }[] = [];
    let curPaq = '';
    for (const row of sorted) {
      if (row.paquete !== curPaq) {
        paqueteGroups.push({ paquete: row.paquete, rows: [] });
        curPaq = row.paquete;
      }
      paqueteGroups[paqueteGroups.length - 1].rows.push(row);
    }

    // ── Data rows HTML ──────────────────────────────────────────────────────
    const bodyHtml = paqueteGroups.map(g => {
      const groupHeader = `<tr class="grp-hdr"><td colspan="16">${g.paquete || 'SIN PAQUETE'}</td></tr>`;
      const rows = g.rows.map(r => `<tr>
        <td class="c">${prototipo}</td>
        <td class="txt">${r.paquete}</td>
        <td class="txt">${r.subpaquete}</td>
        <td class="act">${r.actividad}</td>
        <td class="txt desc-col">${r.descripcion}</td>
        <td class="c">${r.unidad}</td>
        <td class="n">$ ${fmt(r.costo_unitario)}</td>
        <td class="c">${r.factor}</td>
        <td class="n">$ ${fmt(r.importeContrato)}</td>
        <td class="n">${fmt(r.ant)}</td>
        <td class="n">${fmt(r.estaEst)}</td>
        <td class="n">${fmt(r.acum)}</td>
        <td class="n">$ ${fmt(r.importeAnt)}</td>
        <td class="n hi">$ ${fmt(r.importeEstaEst)}</td>
        <td class="n">$ ${fmt(r.importeAcum)}</td>
        <td class="c">${r.avance.toFixed(1)}%</td>
      </tr>`).join('');
      return groupHeader + rows;
    }).join('');

    // ── Totals for data table columns ───────────────────────────────────────
    const totalImporteContrato = computedRows.reduce((s, r) => s + r.importeContrato, 0);
    const totalAntVol = computedRows.reduce((s, r) => s + r.ant, 0);
    const totalEstaVol = computedRows.reduce((s, r) => s + r.estaEst, 0);
    const totalAcumVol = computedRows.reduce((s, r) => s + r.acum, 0);
    const totalAntImp = estimadoAcumulado;
    const totalAcumImp = computedRows.reduce((s, r) => s + r.importeAcum, 0);
    const totalAvance = totalImporteContrato > 0 ? (totalAcumImp / totalImporteContrato) * 100 : 0;

    // ── Hoja 2: Evidencia fotográfica — 6 fotos por hoja (3 cols × 2 filas)
    let evidenciaPages = '';
    if (evidencias.length > 0) {
      const perPage = 6; // siempre 3 columnas × 2 filas
      const chunks: any[][] = [];
      for (let i = 0; i < evidencias.length; i += perPage) chunks.push(evidencias.slice(i, i + perPage));
      evidenciaPages = chunks.map((chunk, pi) => `
        <div class="page-break">
          ${buildHeader('EVIDENCIA FOTOGRÁFICA')}
          <div class="section-title">EVIDENCIA FOTOGRÁFICA</div>
          <div class="foto-grid-6">
            ${chunk.map((f: any, fi: number) => {
              const b64 = evidenciasBase64[f.id];
              const imgSrc = b64 ? `data:image/jpeg;base64,${b64}` : '';
              return `
              <div class="foto-cell">
                ${imgSrc
                  ? `<img src="${imgSrc}" class="foto-img"/>`
                  : `<div class="foto-placeholder">Sin imagen</div>`}
                <div class="media-label">${pi * perPage + fi + 1}. ${f.descripcion || f.actividad || ''}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`).join('');
    }

    // ── Hoja 3: Croquis — 2 por hoja, imágenes en base64 ────────────────────
    let croquesPages = '';
    if (croquisList.length > 0) {
      const chunks: any[][] = [];
      for (let i = 0; i < croquisList.length; i += 2) chunks.push(croquisList.slice(i, i + 2));
      croquesPages = chunks.map((chunk, pi) => `
        <div class="page-break">
          ${buildHeader('CROQUIS')}
          <div class="section-title">CROQUIS</div>
          <div class="croquis-grid">
            ${chunk.map((c: any, ci: number) => {
              const b64 = croquisBase64[c.id];
              const imgSrc = b64 ? `data:image/jpeg;base64,${b64}` : '';
              return `
              <div class="croquis-item">
                ${imgSrc
                  ? `<img src="${imgSrc}"/>`
                  : `<div class="foto-placeholder">Sin imagen</div>`}
                <div class="media-label">${pi * 2 + ci + 1}. ${c.descripcion || ''}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`).join('');
    }

    // ── Full HTML ───────────────────────────────────────────────────────────
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  @page { size: letter landscape; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 7px; color: #000; padding: 0; }

  /* ── Header table ─────────────────────────────────────── */
  .hdr { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  .hdr td { border: 1px solid #000; padding: 2px 4px; font-size: 8px; }
  .logo-cell { width: 8%; min-width: 80px; min-height: 80px; text-align: center; vertical-align: middle; background: #fff; font-size: 7px; color: #999; }
  .hdr-title { background: #1F4E79; color: #fff; font-weight: 700; font-size: 9px; text-align: center; vertical-align: middle; }
  .hdr-val { background: #FFFFCC; font-weight: 700; font-size: 9px; text-align: center; vertical-align: middle; }

  /* ── Subtitle row (Row 7) ─────────────────────────────── */
  .subtitle-tbl { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .subtitle-tbl td { border: 1px solid #000; padding: 3px 6px; }
  .subtitle-left { width: 76%; font-weight: 700; font-size: 10px; background: #D6E4F0; }
  .subtitle-sem-label { width: 12%; font-weight: 700; font-size: 10px; text-align: center; background: #1F4E79; color: #fff; }
  .subtitle-sem-val { width: 12%; font-weight: 700; font-size: 14px; text-align: center; background: #FFFFCC; }

  /* ── Description row ──────────────────────────────────── */
  .desc-tbl { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .desc-tbl td { border: 1px solid #000; padding: 3px 6px; font-size: 8px; }
  .desc-label { width: 18%; font-weight: 700; background: #D6E4F0; }
  .desc-val { background: #FFFFCC; word-wrap: break-word; }

  /* ── Data table ───────────────────────────────────────── */
  .data { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .data th, .data td { border: 1px solid #000; padding: 0px 1px; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; }
  .data th { font-size: 5.5px; font-weight: 700; text-align: center; vertical-align: middle; white-space: normal; word-wrap: break-word; }
  .th1 { background: #1F4E79; color: #fff; }
  .th2 { background: #2E75B6; color: #fff; }
  .data td { font-size: 6px; vertical-align: top; }
  .grp-hdr td { background: #D6E4F0; font-weight: 700; font-size: 7px; padding: 3px 4px; }
  .act { font-weight: 700; color: #1F4E79; white-space: nowrap; }
  .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .desc-col { white-space: normal; word-wrap: break-word; }
  .c { text-align: center; }
  .n { text-align: right; white-space: nowrap; }
  .hi { font-weight: 700; color: #006100; }

  /* ── Footer totals ────────────────────────────────────── */
  .footer-row td { font-weight: 700; font-size: 8px; border: 1px solid #000; padding: 3px 4px; }
  .footer-label { text-align: right; background: #D6E4F0; }
  .footer-val { text-align: right; background: #FFFFCC; }
  .footer-total td { font-size: 9px; }
  .footer-total .footer-val { color: #006100; font-size: 10px; }

  /* ── Firmas ───────────────────────────────────────────── */
  .firmas { margin-top: 30px; display: flex; justify-content: space-around; }
  .firma { text-align: center; border-top: 1px solid #000; padding-top: 4px; min-width: 150px; font-size: 8px; font-weight: 700; }

  /* ── Page break + sections ────────────────────────────── */
  .page-break { page-break-before: always; padding-top: 8px; }
  .section-title { font-size: 11px; font-weight: 700; color: #1F4E79; text-transform: uppercase; letter-spacing: 1px; margin: 4px 0 8px; }

  /* ── Evidencia: 3 cols × 2 filas = 6 fotos por hoja ──── */
  .foto-grid-6 { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); gap: 8px; width: 100%; height: calc(100vh - 40mm); }
  .foto-cell { display: flex; flex-direction: column; align-items: center; overflow: hidden; }
  .foto-img { width: 100%; flex: 1; object-fit: contain; max-height: 120mm; border-radius: 4px; border: 1px solid #bbb; }
  .foto-placeholder { width: 100%; flex: 1; background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #999; border: 1px solid #ddd; border-radius: 4px; }
  .media-label { font-size: 7px; color: #555; margin-top: 3px; text-align: center; width: 100%; }

  /* ── Croquis: 2 por hoja ──────────────────────────────── */
  .croquis-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; width: 100%; }
  .croquis-item { text-align: center; }
  .croquis-item img { width: 100%; object-fit: contain; max-height: 180mm; border-radius: 4px; border: 1px solid #bbb; }
</style>
</head>
<body>

${buildHeader('SOPORTE DE ESTIMACION')}
${descripcionHtml}

<table class="data" cellspacing="0" cellpadding="0">
  <colgroup>
    <col style="width:4%"/>
    <col style="width:10%"/>
    <col style="width:9%"/>
    <col style="width:8%"/>
    <col style="width:11%"/>
    <col style="width:3%"/>
    <col style="width:5%"/>
    <col style="width:4%"/>
    <col style="width:7%"/>
    <col style="width:4%"/>
    <col style="width:4%"/>
    <col style="width:4%"/>
    <col style="width:7%"/>
    <col style="width:7%"/>
    <col style="width:7%"/>
    <col style="width:4%"/>
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2" class="th1">PROTO-<br/>TIPO</th>
      <th rowspan="2" class="th1">PAQUETE</th>
      <th rowspan="2" class="th1">SUB-<br/>PAQUETE</th>
      <th rowspan="2" class="th1">ACTIVIDAD</th>
      <th rowspan="2" class="th1">DESCRIPCION</th>
      <th colspan="4" class="th1">CONTRATO</th>
      <th colspan="3" class="th1">VOLUMENES ESTIMADOS DE OBRA</th>
      <th colspan="3" class="th1">IMPORTES ESTIMADOS DE OBRA</th>
      <th rowspan="2" class="th1">AVANCE<br/>%</th>
    </tr>
    <tr>
      <th class="th2">UNIDAD</th>
      <th class="th2">C. UNIT.</th>
      <th class="th2">FACTOR</th>
      <th class="th2">IMPORTE</th>
      <th class="th2">ANTERIOR</th>
      <th class="th2">ESTA EST.</th>
      <th class="th2">ACUM.</th>
      <th class="th2">ANTERIOR</th>
      <th class="th2">ESTA EST.</th>
      <th class="th2">ACUM.</th>
    </tr>
  </thead>
  <tbody>
    ${bodyHtml}
    <tr class="footer-row">
      <td colspan="8" class="footer-label">TOTALES</td>
      <td class="footer-val">$ ${fmt(totalImporteContrato)}</td>
      <td class="footer-val">${fmt(totalAntVol)}</td>
      <td class="footer-val">${fmt(totalEstaVol)}</td>
      <td class="footer-val">${fmt(totalAcumVol)}</td>
      <td class="footer-val">$ ${fmt(totalAntImp)}</td>
      <td class="footer-val" style="color:#006100">$ ${fmt(localSubtotal)}</td>
      <td class="footer-val">$ ${fmt(totalAcumImp)}</td>
      <td class="footer-val">${totalAvance.toFixed(1)}%</td>
    </tr>
  </tbody>
</table>

<table style="width:100%;border-collapse:collapse;margin-top:8px;" cellspacing="0">
  <tr class="footer-row">
    <td style="width:75%;border:none;"></td>
    <td class="footer-label" style="width:13%">SUBTOTAL ESTIMACIÓN</td>
    <td class="footer-val" style="width:12%">$ ${fmt(localSubtotal)}</td>
  </tr>
  <tr class="footer-row">
    <td style="border:none;"></td>
    <td class="footer-label">RETENCIÓN (F.G.) ${retencion}%</td>
    <td class="footer-val" style="color:#c0392b">-$ ${fmt(localRetencion)}</td>
  </tr>
  <tr class="footer-row footer-total">
    <td style="border:none;"></td>
    <td class="footer-label" style="font-size:10px">TOTAL A PAGAR</td>
    <td class="footer-val">$ ${fmt(localTotal)}</td>
  </tr>
</table>

<div class="firmas">
  <div class="firma"><div style="margin-bottom:30px"></div>ELABORÓ</div>
  <div class="firma"><div style="margin-bottom:30px"></div>REVISÓ</div>
  <div class="firma"><div style="margin-bottom:30px"></div>AUTORIZÓ</div>
</div>

${evidenciaPages}
${croquesPages}
</body>
</html>`;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const html = await buildHtml();
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
      });
      // #7: Usar expo-sharing para compartir el archivo PDF directamente
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Compartir no disponible en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Compartir PDF Estimación',
      });
    } catch (e) {
      Alert.alert('Error', 'No se pudo generar el PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handleStartEdit = useCallback((actividad: string, estaEstBase: number) => {
    setEditedEstaEst(prev => {
      if (prev[actividad] !== undefined) return prev;
      return { ...prev, [actividad]: String(estaEstBase) };
    });
    setEditingActividad(actividad);
  }, []);

  const handleStopEdit = useCallback(() => {
    setEditingActividad(null);
  }, []);

  const handlePrint = async () => {
    setExporting(true);
    try {
      await Print.printAsync({
        html: await buildHtml(),
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
      });
    } catch { /* cancelled */ }
    finally { setExporting(false); }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f9fb', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#003d9b" />
      </View>
    );
  }

  if (!estimacion || !proyecto) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f9fb', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#737685' }}>Estimación no encontrada</Text>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      {/* Header — Fila 1: flecha + título + conjunto */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, borderBottomWidth: 0 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <MaterialIcons name="arrow-back" size={22} color="#191c1e" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#191c1e' }}>Soporte de Estimación</Text>
          <Text style={{ fontSize: 12, color: '#737685', marginTop: 1 }}>{proyecto?.conjunto ?? ''}</Text>
        </View>
      </View>
      {/* Header — Fila 2: botones */}
      <View style={{
        flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12,
        borderBottomWidth: 1, borderBottomColor: '#e1e2e4',
      }}>
        <TouchableOpacity
          onPress={handlePrint}
          activeOpacity={0.8}
          style={{ padding: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          disabled={exporting}
        >
          <MaterialIcons name="visibility" size={22} color="#003d9b" />
          <Text style={{ color: '#003d9b', fontSize: 11, fontWeight: '700' }}>PRE VISUALIZAR</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleExport}
          activeOpacity={0.85}
          disabled={exporting}
          style={{
            backgroundColor: '#003d9b', borderRadius: 8,
            paddingHorizontal: 12, paddingVertical: 7,
            flexDirection: 'row', alignItems: 'center', gap: 5,
          }}
        >
          {exporting
            ? <ActivityIndicator size={14} color="#ffffff" />
            : <MaterialIcons name="share" size={14} color="#ffffff" />}
          <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>
            {exporting ? 'Generando…' : 'COMPARTIR PDF'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Summary card — totales en tiempo real */}
        <View style={{
          margin: 16, backgroundColor: '#003d9b', borderRadius: 14,
          padding: 16,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                {proyecto.codigo} · {proyecto.numero_contrato}
              </Text>
              <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 }}>
                Estimación #{estimacion.numero}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 3 }}>
                {estimacion.periodo_desde} – {estimacion.periodo_hasta}
              </Text>
            </View>
            <View style={{
              backgroundColor: estimacion.status === 'finalizada' ? '#a3f69c' : 'rgba(255,255,255,0.15)',
              borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
            }}>
              <Text style={{
                fontSize: 9, fontWeight: '700',
                color: estimacion.status === 'finalizada' ? '#004f11' : 'rgba(255,255,255,0.8)',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {estimacion.status === 'finalizada' ? 'Finalizada' : 'Borrador'}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginTop: 14, gap: 12 }}>
            {[
              { label: 'Subtotal', value: `$${fmt(localSubtotal)}`, color: '#ffffff' },
              { label: 'Retención 5%', value: `-$${fmt(localRetencion)}`, color: '#ff9e9e' },
              { label: 'Total a Pagar', value: `$${fmt(localTotal)}`, color: '#a3f69c' },
            ].map(({ label, value, color }) => (
              <View key={label} style={{ flex: 1 }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {label}
                </Text>
                <Text style={{ color, fontSize: 12, fontWeight: '800', marginTop: 3 }}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Conceptos agrupados con edición inline */}
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {computedRows.length} CONCEPTOS SELECCIONADOS
          </Text>

          {computedRows.length === 0 ? (
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 12, padding: 28, alignItems: 'center',
            }}>
              <MaterialIcons name="info-outline" size={36} color="#c3c6d6" />
              <Text style={{ color: '#737685', fontSize: 13, marginTop: 10, fontWeight: '600', textAlign: 'center' }}>
                Sin conceptos registrados.{'\n'}Ingresa cantidades en el grid de estimación.
              </Text>
            </View>
          ) : (
            computedRows.map((row) => (
              <View key={row.actividad} style={{
                backgroundColor: '#ffffff', borderRadius: 10,
                padding: 12, marginBottom: 6,
              }}>
                {/* Cabecera: código + descripción + unidad */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#003d9b' }}>{row.actividad}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: '#434654', fontWeight: '600' }} numberOfLines={1}>
                      {row.descripcion}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 9, color: '#737685', fontWeight: '700' }}>{row.unidad}</Text>
                </View>

                {/* Columnas: ANT | ESTA EST (editable) | ACUM | AVANCE% */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {/* ANT. */}
                  <View style={{ flex: 1, backgroundColor: '#f4f5f8', borderRadius: 6, padding: 6 }}>
                    <Text style={{ fontSize: 8, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>ANT.</Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#191c1e', marginTop: 1 }}>
                      {row.ant % 1 === 0 ? row.ant : row.ant.toFixed(2)}
                    </Text>
                  </View>

                  {/* ESTA EST. — editable inline */}
                  <View style={{ flex: 1, backgroundColor: '#e8f5e9', borderRadius: 6, padding: 6 }}>
                    <Text style={{ fontSize: 8, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>ESTA EST.</Text>
                    {editingActividad === row.actividad ? (
                      <TextInput
                        value={editedEstaEst[row.actividad] ?? String(row.estaEstBase)}
                        onChangeText={(t) => setEditedEstaEst(prev => ({ ...prev, [row.actividad]: t }))}
                        onBlur={handleStopEdit}
                        onSubmitEditing={handleStopEdit}
                        keyboardType="numeric"
                        autoFocus
                        style={{
                          fontSize: 11, fontWeight: '800', color: '#004f11',
                          padding: 0, marginTop: 1,
                          borderBottomWidth: 1, borderBottomColor: '#004f11',
                        }}
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleStartEdit(row.actividad, row.estaEstBase)}
                        activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 4 }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#004f11' }}>
                          {row.estaEst % 1 === 0 ? row.estaEst : row.estaEst.toFixed(2)}
                        </Text>
                        <MaterialIcons name="edit" size={10} color="#004f11" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* ACUM. */}
                  <View style={{ flex: 1, backgroundColor: '#f4f5f8', borderRadius: 6, padding: 6 }}>
                    <Text style={{ fontSize: 8, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>ACUM.</Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#191c1e', marginTop: 1 }}>
                      {row.acum % 1 === 0 ? row.acum : row.acum.toFixed(2)}
                    </Text>
                  </View>

                  {/* AVANCE % */}
                  <View style={{ flex: 1, backgroundColor: '#f4f5f8', borderRadius: 6, padding: 6 }}>
                    <Text style={{ fontSize: 8, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>AVANCE</Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#003d9b', marginTop: 1 }}>
                      {row.avance.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {/* Importe Esta Est. */}
                <View style={{ marginTop: 6, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 9, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    Importe Esta Est.
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#004f11' }}>
                    ${fmt(row.importeEstaEst)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
