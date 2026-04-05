/**
 * pdf/soporte/[id].tsx
 * Pantalla 2: Soporte de Estimación — genera y exporta PDF oficial.
 */

import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, SafeAreaView, Platform, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  initDatabase, getEstimacionById, getProyectoById,
  getDetallesByEstimacion, getEmpresa,
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

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        const est = await getEstimacionById(Number(id));
        if (!est) { setLoading(false); return; }
        const [proy, emp, rows] = await Promise.all([
          getProyectoById(est.proyecto_id),
          getEmpresa(),
          getDetallesByEstimacion(Number(id)),
        ]);
        setEstimacion(est);
        setProyecto(proy);
        setEmpresa(emp);
        setDetalles(rows as RowData[]);
      } catch (e) {
        console.error('[PdfSoporte] load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const buildHtml = () => {
    const rowsHtml = detalles.map(r => `
      <tr>
        <td class="act">${r.actividad}</td>
        <td class="desc">${r.descripcion}</td>
        <td class="center">${r.unidad}</td>
        <td class="num">${fmt(r.cantidad_anterior)}</td>
        <td class="num">${fmt(r.cantidad_esta_est)}</td>
        <td class="num">${fmt(r.cantidad_acumulada)}</td>
        <td class="num">$${fmt(r.importe_anterior)}</td>
        <td class="num imp">$${fmt(r.importe_esta_est)}</td>
        <td class="num">$${fmt(r.importe_acumulado)}</td>
        <td class="num">${r.avance_financiero.toFixed(1)}%</td>
      </tr>`).join('');

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
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <h1>${empresa?.nombre ?? 'EMPRESA'}</h1>
    <h2>SOPORTE DE ESTIMACIÓN</h2>
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
  <div class="meta-item">
    <div class="meta-label">Conjunto</div>
    <div class="meta-value">${proyecto?.codigo ?? ''}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">No. Contrato</div>
    <div class="meta-value">${proyecto?.numero_contrato ?? ''}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Monto Contrato</div>
    <div class="meta-value">$${fmt(proyecto?.monto_contrato ?? 0)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Prototipo</div>
    <div class="meta-value">${proyecto?.prototipo ?? ''}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Actividad</th>
      <th>Descripción</th>
      <th>U.</th>
      <th>Cant. Ant.</th>
      <th>Esta Est.</th>
      <th>Acumulado</th>
      <th>Imp. Ant.</th>
      <th>Imp. Esta Est.</th>
      <th>Imp. Acum.</th>
      <th>Avance</th>
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
      <span class="total-value">$${fmt(estimacion?.subtotal ?? 0)}</span>
    </div>
    <div class="total-row">
      <span class="total-label">Retención (5%)</span>
      <span class="total-value" style="color:#c0392b">-$${fmt(estimacion?.retencion ?? 0)}</span>
    </div>
    <div class="total-row main">
      <span class="total-label" style="font-weight:700;font-size:9px">TOTAL A PAGAR</span>
      <span class="total-value green">$${fmt(estimacion?.total_a_pagar ?? 0)}</span>
    </div>
  </div>
</div>

<div class="footer">
  <div class="firma">
    <div style="margin-bottom:20px"></div>
    ELABORÓ
  </div>
  <div class="firma">
    <div style="margin-bottom:20px"></div>
    REVISÓ
  </div>
  <div class="firma">
    <div style="margin-bottom:20px"></div>
    AUTORIZÓ
  </div>
</div>
</body>
</html>`;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const html = buildHtml();
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Estimación #${estimacion?.numero}`,
        });
      } else {
        Alert.alert('PDF generado', `Guardado en:\n${uri}`);
      }
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
          style={{ padding: 8 }}
          disabled={exporting}
        >
          <MaterialIcons name="print" size={22} color="#003d9b" />
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
            : <MaterialIcons name="download" size={14} color="#ffffff" />}
          <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>
            {exporting ? 'Generando…' : 'Exportar PDF'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Summary card */}
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
              { label: 'Subtotal', value: `$${fmt(estimacion.subtotal || 0)}`, color: '#ffffff' },
              { label: 'Retención 5%', value: `-$${fmt(estimacion.retencion || 0)}`, color: '#ff9e9e' },
              { label: 'Total a Pagar', value: `$${fmt(estimacion.total_a_pagar || 0)}`, color: '#a3f69c' },
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

        {/* Concept rows */}
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {detalles.length} conceptos con movimiento
          </Text>

          {detalles.length === 0 ? (
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 12, padding: 28, alignItems: 'center',
            }}>
              <MaterialIcons name="info-outline" size={36} color="#c3c6d6" />
              <Text style={{ color: '#737685', fontSize: 13, marginTop: 10, fontWeight: '600', textAlign: 'center' }}>
                Sin conceptos registrados.{'\n'}Ingresa cantidades en el grid de estimación.
              </Text>
            </View>
          ) : (
            detalles.map((row, i) => (
              <View key={i} style={{
                backgroundColor: '#ffffff', borderRadius: 10,
                padding: 12, marginBottom: 6,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#003d9b' }}>{row.actividad}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: '#434654', fontWeight: '600' }} numberOfLines={1}>
                      {row.descripcion}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 9, color: '#737685', fontWeight: '700' }}>{row.unidad}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { label: 'Ant.', qty: row.cantidad_anterior, imp: row.importe_anterior },
                    { label: 'Esta Est.', qty: row.cantidad_esta_est, imp: row.importe_esta_est },
                    { label: 'Acum.', qty: row.cantidad_acumulada, imp: row.importe_acumulado },
                  ].map(({ label, qty, imp }) => (
                    <View key={label} style={{ flex: 1, backgroundColor: '#f4f5f8', borderRadius: 6, padding: 6 }}>
                      <Text style={{ fontSize: 8, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: label === 'Esta Est.' ? '#004f11' : '#191c1e', marginTop: 1 }}>
                        {qty % 1 === 0 ? qty : qty.toFixed(2)}
                      </Text>
                      <Text style={{ fontSize: 9, color: '#737685' }}>${fmt(imp)}</Text>
                    </View>
                  ))}
                  <View style={{ flex: 1, backgroundColor: '#f4f5f8', borderRadius: 6, padding: 6 }}>
                    <Text style={{ fontSize: 8, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>Avance</Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#003d9b', marginTop: 1 }}>
                      {row.avance_financiero.toFixed(1)}%
                    </Text>
                  </View>
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
