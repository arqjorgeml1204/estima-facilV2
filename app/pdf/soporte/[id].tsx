/**
 * pdf/soporte/[id].tsx
 * Pantalla 2: Soporte de Estimación — genera y exporta PDF oficial.
 */

import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, SafeAreaView, Platform, Alert, Share, TextInput,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  initDatabase, getEstimacionById, getProyectoById,
  getDetallesByEstimacion, getEmpresa,
  getEvidenciasByEstimacion, getCroquisByEstimacion,
} from '../../../db/database';

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
}

interface GroupedRow {
  actividad: string;
  descripcion: string;
  unidad: string;
  costo_unitario: number;
  ant: number;
  estaEstBase: number;
}

interface ComputedRow extends GroupedRow {
  estaEst: number;
  acum: number;
  importeEstaEst: number;
  avance: number;
}

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PdfSoporte() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [estimacion, setEstimacion] = useState<any>(null);
  const [proyecto, setProyecto] = useState<any>(null);
  const [empresa, setEmpresa] = useState<any>(null);
  const [detalles, setDetalles] = useState<RowData[]>([]);
  const [evidencias, setEvidencias] = useState<any[]>([]);
  const [croquisList, setCroquisList] = useState<any[]>([]);
  const [editedEstaEst, setEditedEstaEst] = useState<Record<string, string>>({});
  const [editingActividad, setEditingActividad] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        const est = await getEstimacionById(Number(id));
        if (!est) { setLoading(false); return; }
        const [proy, emp, rows, evs, cros] = await Promise.all([
          getProyectoById(est.proyecto_id),
          getEmpresa(),
          getDetallesByEstimacion(Number(id)),
          getEvidenciasByEstimacion(Number(id)),
          getCroquisByEstimacion(Number(id)),
        ]);
        setEstimacion(est);
        setProyecto(proy);
        setEmpresa(emp);
        setDetalles(rows as RowData[]);
        setEvidencias(evs as any[]);
        setCroquisList(cros as any[]);
      } catch (e) {
        console.error('[PdfSoporte] load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Cambio 3b: Agrupar por actividad, sumar cantidades ───────────────────────
  const groupedRows: GroupedRow[] = (() => {
    const map: Record<string, GroupedRow> = {};
    for (const d of detalles) {
      const key = d.actividad;
      if (!map[key]) {
        map[key] = {
          actividad: d.actividad,
          descripcion: d.descripcion,
          unidad: d.unidad,
          costo_unitario: d.costo_unitario,
          ant: 0,
          estaEstBase: 0,
        };
      }
      map[key].ant += d.cantidad_anterior;
      map[key].estaEstBase += d.cantidad_esta_est;
    }
    return Object.values(map);
  })();

  // Aplicar overrides manuales y calcular derivados
  const computedRows: ComputedRow[] = groupedRows.map(g => {
    const estaEst = editedEstaEst[g.actividad] !== undefined
      ? parseFloat(editedEstaEst[g.actividad]) || 0
      : g.estaEstBase;
    const acum = g.ant + estaEst;
    const importeEstaEst = estaEst * g.costo_unitario;
    const avance = proyecto?.monto_contrato
      ? (acum * g.costo_unitario / proyecto.monto_contrato) * 100
      : 0;
    return { ...g, estaEst, acum, importeEstaEst, avance };
  });

  // Totales locales recalculados en tiempo real
  const localSubtotal = computedRows.reduce((s, r) => s + r.importeEstaEst, 0);
  const localRetencion = localSubtotal * 0.05;
  const localTotal = localSubtotal - localRetencion;

  // ── Cambio 9 + 3b: buildHtml con hojas adicionales y columnas actualizadas ───
  const buildHtml = () => {
    const buildHeader = (sectionTitle: string) => `
      <div class="header">
        <div class="header-left">
          <h1>${empresa?.nombre ?? 'EMPRESA'}</h1>
          <h2>${sectionTitle}</h2>
          ${empresa?.rfc ? `<div style="font-size:7.5px;color:#737685;margin-top:2px">RFC: ${empresa.rfc}</div>` : ''}
        </div>
        <div class="header-right">
          <span class="badge">EST. #${estimacion?.numero ?? ''}</span>
          <div style="font-size:7px;color:#737685;margin-top:4px">
            ${estimacion?.periodo_desde ?? ''} — ${estimacion?.periodo_hasta ?? ''}
          </div>
          <div style="font-size:7px;color:#737685;margin-top:2px">
            Semana ${estimacion?.semana ?? ''}
          </div>
        </div>
      </div>
      <div class="meta">
        <div class="meta-item"><div class="meta-label">Conjunto</div><div class="meta-value">${proyecto?.codigo ?? ''}</div></div>
        <div class="meta-item"><div class="meta-label">No. Contrato</div><div class="meta-value">${proyecto?.numero_contrato ?? ''}</div></div>
        <div class="meta-item"><div class="meta-label">Monto Contrato</div><div class="meta-value">$${fmt(proyecto?.monto_contrato ?? 0)}</div></div>
        <div class="meta-item"><div class="meta-label">Prototipo</div><div class="meta-value">${proyecto?.prototipo ?? ''}</div></div>
      </div>`;

    const rowsHtml = computedRows.map(r => `
      <tr>
        <td class="act">${r.actividad}</td>
        <td class="desc">${r.descripcion}</td>
        <td class="center">${r.unidad}</td>
        <td class="num">${fmt(r.ant)}</td>
        <td class="num">${fmt(r.estaEst)}</td>
        <td class="num">${fmt(r.acum)}</td>
        <td class="num">${r.avance.toFixed(1)}%</td>
        <td class="num imp">$${fmt(r.importeEstaEst)}</td>
      </tr>`).join('');

    // Hoja 2: Evidencia fotográfica (condicional, máx 4 fotos/página)
    let evidenciaPages = '';
    if (evidencias.length > 0) {
      const chunks: any[][] = [];
      for (let i = 0; i < evidencias.length; i += 4) chunks.push(evidencias.slice(i, i + 4));
      evidenciaPages = chunks.map((chunk, pi) => `
        <div class="page-break">
          ${buildHeader('EVIDENCIA FOTOGRÁFICA')}
          <div class="section-title">EVIDENCIA FOTOGRÁFICA</div>
          <div class="foto-grid">
            ${chunk.map((f, fi) => `
              <div class="foto-cell">
                <img src="${f.imagen_uri}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;border:1px solid #e1e2e4;"/>
                <div class="media-label">${pi * 4 + fi + 1}. ${f.descripcion || f.actividad || ''}</div>
              </div>`).join('')}
          </div>
        </div>`).join('');
    }

    // Hoja 3: Croquis (condicional, máx 2 por página)
    let croquesPages = '';
    if (croquisList.length > 0) {
      const chunks: any[][] = [];
      for (let i = 0; i < croquisList.length; i += 2) chunks.push(croquisList.slice(i, i + 2));
      croquesPages = chunks.map((chunk, pi) => `
        <div class="page-break">
          ${buildHeader('CROQUIS')}
          <div class="section-title">CROQUIS</div>
          <div style="display:flex;flex-direction:column;gap:16px;align-items:center;">
            ${chunk.map((c, ci) => `
              <div style="width:100%;text-align:center;">
                <img src="${c.imagen_uri}" style="max-width:100%;max-height:320px;object-fit:contain;border-radius:4px;border:1px solid #e1e2e4;"/>
                <div class="media-label">${pi * 2 + ci + 1}. ${c.descripcion || ''}</div>
              </div>`).join('')}
          </div>
        </div>`).join('');
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 8px; color: #1a1a1a; padding: 16px; }
  h1 { font-size: 13px; color: #003d9b; font-weight: 800; }
  h2 { font-size: 10px; color: #003d9b; font-weight: 700; margin-top: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 2px solid #003d9b; padding-bottom: 8px; }
  .header-left { flex: 1; }
  .header-right { text-align: right; }
  .badge { display: inline-block; background: #003d9b; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
  .meta-item { background: #f4f5f8; border-radius: 4px; padding: 5px 7px; }
  .meta-label { font-size: 7px; color: #737685; text-transform: uppercase; letter-spacing: .5px; font-weight: 700; }
  .meta-value { font-size: 9px; color: #191c1e; font-weight: 700; margin-top: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #003d9b; color: #fff; font-size: 7px; font-weight: 700; padding: 4px 3px; text-align: center; text-transform: uppercase; letter-spacing: .3px; }
  td { padding: 3px; border-bottom: 1px solid #e8e9ec; font-size: 7.5px; vertical-align: top; }
  tr:nth-child(even) td { background: #f8f9fb; }
  .act { font-weight: 700; color: #003d9b; white-space: nowrap; }
  .desc { max-width: 140px; }
  .center { text-align: center; }
  .num { text-align: right; white-space: nowrap; }
  .imp { font-weight: 700; color: #004f11; }
  .totals { margin-top: 12px; display: flex; justify-content: flex-end; }
  .totals-box { border: 1px solid #e1e2e4; border-radius: 6px; padding: 10px 14px; min-width: 220px; }
  .total-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; }
  .total-row.main { border-top: 2px solid #003d9b; margin-top: 4px; padding-top: 6px; }
  .total-label { font-size: 8px; color: #434654; }
  .total-value { font-size: 9px; font-weight: 700; }
  .total-value.green { color: #004f11; font-size: 11px; }
  .footer { margin-top: 20px; display: flex; justify-content: space-around; }
  .firma { text-align: center; border-top: 1px solid #aaa; padding-top: 4px; min-width: 140px; font-size: 7.5px; color: #737685; }
  .page-break { page-break-before: always; padding-top: 16px; }
  .section-title { font-size: 11px; font-weight: 700; color: #003d9b; text-transform: uppercase; letter-spacing: 1px; margin: 4px 0 12px; }
  .foto-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .media-label { font-size: 7.5px; color: #737685; margin-top: 4px; text-align: center; }
</style>
</head>
<body>
${buildHeader('SOPORTE DE ESTIMACIÓN')}

<table>
  <thead>
    <tr>
      <th>Actividad</th>
      <th>Descripción</th>
      <th>U.</th>
      <th>ANT. (Vol)</th>
      <th>ESTA EST. (Vol)</th>
      <th>ACUM. (Vol)</th>
      <th>Avance %</th>
      <th>Imp. Esta Est.</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>

<div class="totals">
  <div class="totals-box">
    <div class="total-row">
      <span class="total-label">Subtotal</span>
      <span class="total-value">$${fmt(localSubtotal)}</span>
    </div>
    <div class="total-row">
      <span class="total-label">Retención (5%)</span>
      <span class="total-value" style="color:#c0392b">-$${fmt(localRetencion)}</span>
    </div>
    <div class="total-row main">
      <span class="total-label" style="font-weight:700;font-size:9px">TOTAL A PAGAR</span>
      <span class="total-value green">$${fmt(localTotal)}</span>
    </div>
  </div>
</div>

<div class="footer">
  <div class="firma"><div style="margin-bottom:20px"></div>ELABORÓ</div>
  <div class="firma"><div style="margin-bottom:20px"></div>REVISÓ</div>
  <div class="firma"><div style="margin-bottom:20px"></div>AUTORIZÓ</div>
</div>

${evidenciaPages}
${croquesPages}
</body>
</html>`;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const html = buildHtml();
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Share.share({ url: uri, title: 'Estimación PDF' });
    } catch (e) {
      Alert.alert('Error', 'No se pudo generar el PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = async () => {
    setExporting(true);
    try {
      await Print.printAsync({ html: buildHtml() });
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#e1e2e4',
        backgroundColor: '#f8f9fb',
      }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={22} color="#003d9b" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#191c1e', letterSpacing: -0.3 }}>
            Soporte de Estimación
          </Text>
          <Text style={{ fontSize: 10, color: '#737685', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {proyecto.codigo} · Est. #{estimacion.numero}
          </Text>
        </View>
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

        {/* Cambio 3b: Conceptos agrupados con edición inline */}
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 8, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>ESTA EST.</Text>
                      {editingActividad !== row.actividad && (
                        <MaterialIcons name="edit" size={10} color="#004f11" />
                      )}
                    </View>
                    {editingActividad === row.actividad ? (
                      <TextInput
                        value={editedEstaEst[row.actividad] ?? String(row.estaEstBase)}
                        onChangeText={(t) => setEditedEstaEst(prev => ({ ...prev, [row.actividad]: t }))}
                        onBlur={() => setEditingActividad(null)}
                        onSubmitEditing={() => setEditingActividad(null)}
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
                        onPress={() => {
                          if (editedEstaEst[row.actividad] === undefined) {
                            setEditedEstaEst(prev => ({ ...prev, [row.actividad]: String(row.estaEstBase) }));
                          }
                          setEditingActividad(row.actividad);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#004f11', marginTop: 1 }}>
                          {row.estaEst % 1 === 0 ? row.estaEst : row.estaEst.toFixed(2)}
                        </Text>
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
