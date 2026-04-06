/**
 * estimacion/[id].tsx
 * PANTALLA 1: Grid de Realización de Estimación.
 * Conceptos × Unidades (1…N). Tap = toggle, long press = input manual.
 * Fiel al diseño "Blueprint Precision" del Stitch original.
 */

import {
  View, Text, TouchableOpacity, ScrollView, SafeAreaView,
  ActivityIndicator, Modal, TextInput, Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import {
  getEstimacionById,
  getProyectoById,
  getConceptosByProyecto,
  getDetallesByEstimacion,
  upsertDetalle,
  recalcularTotalesEstimacion,
} from '../../db/database';

// ─── ISO Week ──────────────────────────────────────────────────────────────────

function getISOWeek(d: Date): number {
  const date = new Date(d);
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000
    - 3 + (week1.getDay() + 6) % 7) / 7);
}

const currentWeek = getISOWeek(new Date());

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface Concepto {
  id: number;
  actividad: string;
  descripcion: string;
  unidad: string;
  costo_unitario: number;
  factor: number;
  paquete: string;
  subpaquete: string;
}

interface Detalle {
  concepto_id: number;
  cantidad_anterior: number;
  cantidad_esta_est: number;
  cantidad_acumulada: number;
  importe_esta_est: number;
  avance_financiero: number;
}

interface DetalleMap {
  [conceptoId: number]: Detalle;
}

// ─── Input Manual Modal ────────────────────────────────────────────────────────

function InputModal({
  visible, concepto, valorActual,
  onConfirm, onClose,
}: {
  visible: boolean;
  concepto: Concepto | null;
  valorActual: number;
  onConfirm: (val: number) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(valorActual.toString());
  useEffect(() => setVal(valorActual.toString()), [valorActual]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(25,28,30,0.5)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: 24, paddingBottom: 40,
        }}>
          <Text style={{ fontSize: 12, color: '#737685', fontWeight: '600', marginBottom: 4 }}>
            {concepto?.actividad}
          </Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#191c1e', marginBottom: 16 }}>
            {concepto?.descripcion}
          </Text>
          <Text style={{ fontSize: 11, color: '#737685', marginBottom: 8 }}>
            Cantidad esta estimación
          </Text>
          <TextInput
            value={val}
            onChangeText={setVal}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
            style={{
              backgroundColor: '#e7e8ea', borderRadius: 8,
              padding: 14, fontSize: 20, fontWeight: '700', color: '#191c1e',
              borderBottomWidth: 2, borderBottomColor: '#003d9b',
              textAlign: 'center',
            }}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10,
                paddingVertical: 13, alignItems: 'center',
              }}
            >
              <Text style={{ color: '#737685', fontWeight: '700' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const n = parseFloat(val.replace(',', '.'));
                if (isNaN(n) || n < 0) return;
                onConfirm(n);
              }}
              style={{
                flex: 2, backgroundColor: '#003d9b', borderRadius: 10,
                paddingVertical: 13, alignItems: 'center',
              }}
            >
              <Text style={{ color: '#ffffff', fontWeight: '700' }}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Pantalla Principal ────────────────────────────────────────────────────────

export default function EstimacionGrid() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const estId = Number(id);

  const [estimacion, setEstimacion]  = useState<any>(null);
  const [proyecto, setProyecto]      = useState<any>(null);
  const [conceptos, setConceptos]    = useState<Concepto[]>([]);
  const [detalles, setDetalles]      = useState<DetalleMap>({});
  const [loading, setLoading]        = useState(true);
  const [saving, setSaving]          = useState(false);
  const [totales, setTotales]        = useState({ subtotal: 0, retencion: 0, totalAPagar: 0 });

  // Modal input manual
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConcepto, setModalConcepto] = useState<Concepto | null>(null);

  // ── Carga inicial ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const est = await getEstimacionById(estId);
    const proy = await getProyectoById(est.proyecto_id);
    const concs = await getConceptosByProyecto(est.proyecto_id) as Concepto[];
    const dets = await getDetallesByEstimacion(estId);

    const detMap: DetalleMap = {};
    for (const d of dets) {
      detMap[d.concepto_id] = d;
    }

    setEstimacion(est);
    setProyecto(proy);
    setConceptos(concs);
    setDetalles(detMap);
    setTotales({
      subtotal: est.subtotal || 0,
      retencion: est.retencion || 0,
      totalAPagar: est.total_a_pagar || 0,
    });
    setLoading(false);
  }, [estId]);

  useEffect(() => { load(); }, []);

  // ── Actualizar cantidad (tap o modal) ────────────────────────────────────────
  const updateCantidad = async (concepto: Concepto, nuevaCantidad: number) => {
    const anterior = detalles[concepto.id]?.cantidad_anterior ?? 0;

    // Optimistic update
    setDetalles(prev => ({
      ...prev,
      [concepto.id]: {
        concepto_id: concepto.id,
        cantidad_anterior: anterior,
        cantidad_esta_est: nuevaCantidad,
        cantidad_acumulada: anterior + nuevaCantidad,
        importe_esta_est: nuevaCantidad * concepto.costo_unitario,
        avance_financiero: concepto.factor > 0
          ? ((anterior + nuevaCantidad) / concepto.factor) * 100
          : 0,
      },
    }));

    // Persist
    await upsertDetalle(estId, concepto.id, anterior, nuevaCantidad, concepto.costo_unitario);
    const t = await recalcularTotalesEstimacion(estId);
    setTotales(t);
  };

  // Tap = toggle per-cell: each cell has state "estimated" | "current" | "empty"
  // "estimated" = colIdx < cantAnterior  → blocked, do nothing
  // "current"   = colIdx >= cantAnterior && colIdx < cantAnterior + cantEsta → unmark (–1)
  // "empty"     = colIdx >= cantAnterior + cantEsta → mark (+1, up to max)
  const handleCellTap = (concepto: Concepto, colIdx: number) => {
    const cantAnterior = detalles[concepto.id]?.cantidad_anterior ?? 0;
    const cantEsta = detalles[concepto.id]?.cantidad_esta_est ?? 0;
    const isEstimated = colIdx < cantAnterior;
    const isCurrent = colIdx >= cantAnterior && colIdx < cantAnterior + cantEsta;

    if (isEstimated) {
      // blocked — do nothing
      return;
    } else if (isCurrent) {
      // unmark: remove this cell (–1)
      updateCantidad(concepto, cantEsta - 1);
    } else {
      // empty: mark this cell (+1, only if it is the next sequential empty cell)
      const max = concepto.factor - cantAnterior;
      if (cantEsta < max) {
        updateCantidad(concepto, cantEsta + 1);
      }
    }
  };

  // Long press = input manual
  const handleLongPress = (concepto: Concepto) => {
    setModalConcepto(concepto);
    setModalVisible(true);
  };

  const handleModalConfirm = (val: number) => {
    if (modalConcepto) updateCantidad(modalConcepto, val);
    setModalVisible(false);
  };

  // ── Guardar ──────────────────────────────────────────────────────────────────
  const handleGuardar = async () => {
    setSaving(true);
    await recalcularTotalesEstimacion(estId);
    setSaving(false);
    Alert.alert('Guardado', 'La estimación fue guardada correctamente.');
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f9fb', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#003d9b" />
      </View>
    );
  }

  const totalUnidades = proyecto?.total_unidades ?? 1;

  // ── Columnas: unidades 1…N ───────────────────────────────────────────────────
  const colCount = Math.min(totalUnidades, 20);
  const CELL_W = 42;
  const COL_W = 170;

  // ── Agrupar por paquete ───────────────────────────────────────────────────────
  const paquetes: { nombre: string; conceptos: Concepto[] }[] = [];
  let lastPaq = '';
  for (const c of conceptos) {
    if (c.paquete !== lastPaq) {
      paquetes.push({ nombre: c.paquete, conceptos: [] });
      lastPaq = c.paquete;
    }
    paquetes[paquetes.length - 1].conceptos.push(c);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      {/* ── TopAppBar ── */}
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: 'rgba(248,249,251,0.95)',
        borderBottomWidth: 1, borderBottomColor: 'rgba(195,198,214,0.15)',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ padding: 6, borderRadius: 99 }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="menu" size={22} color="#003d9b" />
          </TouchableOpacity>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#191c1e', letterSpacing: -0.3 }}>
                {proyecto?.codigo}
              </Text>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 3,
                  paddingHorizontal: 8, paddingVertical: 3,
                  borderRadius: 4, borderWidth: 1,
                  borderColor: 'rgba(0,61,155,0.2)',
                  backgroundColor: 'rgba(0,61,155,0.05)',
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#003d9b', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Cambiar
                </Text>
                <MaterialIcons name="swap-horiz" size={12} color="#003d9b" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#737685', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {proyecto?.nombre?.split('—')[1]?.trim() ?? proyecto?.nombre}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={{ padding: 6, borderRadius: 99 }}>
          <MaterialIcons name="more-vert" size={22} color="#003d9b" />
        </TouchableOpacity>
      </View>

      {/* ── Summary Card ── */}
      <View style={{
        marginHorizontal: 16, marginTop: 12,
        backgroundColor: '#ffffff', borderRadius: 8, padding: 14,
        shadowColor: '#191c1e', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
      }}>
        <View style={{ flexDirection: 'row', gap: 0 }}>
          <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: 'rgba(195,198,214,0.1)', paddingRight: 12 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 2 }}>
              Contrato
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#191c1e' }}>
              ${(proyecto?.monto_contrato / 1000).toFixed(0)}k
            </Text>
          </View>
          <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: 'rgba(195,198,214,0.1)', paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 2 }}>
              Estimado
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#004f11' }}>
                ${(totales.subtotal / 1000).toFixed(1)}k
              </Text>
              {proyecto?.monto_contrato > 0 && (
                <View style={{ backgroundColor: '#a3f69c', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: '#004f11' }}>
                    {Math.round((totales.subtotal / proyecto.monto_contrato) * 100)}%
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={{ flex: 1, paddingLeft: 12 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 2 }}>
              Restante
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#003d9b' }}>
              ${((proyecto?.monto_contrato - totales.subtotal) / 1000).toFixed(1)}k
            </Text>
          </View>
        </View>

        <View style={{
          marginTop: 10, paddingTop: 10,
          borderTopWidth: 1, borderTopColor: 'rgba(195,198,214,0.1)',
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialIcons name="calendar-today" size={13} color="#003d9b" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#434654', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Semana actual: <Text style={{ color: '#003d9b' }}>{currentWeek}</Text>
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: '#737685' }}>
            Est. #{estimacion?.numero}
          </Text>
        </View>
      </View>

      {/* ── Grid ── */}
      <View style={{
        flex: 1, marginTop: 12, marginHorizontal: 16,
        backgroundColor: '#f3f4f6', borderRadius: 8,
        overflow: 'hidden',
        shadowColor: '#191c1e', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
      }}>
        {/* Leyenda */}
        <View style={{
          paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: 'rgba(231,232,234,0.2)',
          borderBottomWidth: 1, borderBottomColor: 'rgba(195,198,214,0.15)',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#191c1e' }}>Conceptos</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[
              { color: '#004f11', label: 'Listo' },
              { color: '#e1e2e4', label: 'Pend.' },
            ].map(({ color, label }) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, backgroundColor: color, borderRadius: 2 }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {/* Header de columnas */}
              <View style={{ flexDirection: 'row', backgroundColor: 'rgba(231,232,234,0.5)' }}>
                {/* Columna fija concepto */}
                <View style={{
                  width: COL_W, paddingVertical: 10, paddingHorizontal: 12,
                  borderRightWidth: 1, borderRightColor: 'rgba(195,198,214,0.1)',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#434654', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Concepto
                  </Text>
                </View>
                {/* Columnas numéricas */}
                {Array.from({ length: colCount }, (_, i) => (
                  <View key={i} style={{ width: CELL_W, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#434654', textTransform: 'uppercase' }}>
                      {i + 1}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Filas por paquete */}
              {paquetes.map((paq) => (
                <View key={paq.nombre}>
                  {/* Separador de paquete */}
                  <View style={{
                    paddingHorizontal: 12, paddingVertical: 5,
                    backgroundColor: 'rgba(0,61,155,0.06)',
                    borderTopWidth: 1, borderBottomWidth: 1,
                    borderColor: 'rgba(195,198,214,0.2)',
                  }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#003d9b', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {paq.nombre}
                    </Text>
                  </View>

                  {paq.conceptos.map((concepto, idx) => {
                    const det = detalles[concepto.id];
                    const cantEsta = det?.cantidad_esta_est ?? 0;
                    const cantAnterior = det?.cantidad_anterior ?? 0;
                    const isEvenRow = idx % 2 === 0;

                    return (
                      <View
                        key={concepto.id}
                        style={{
                          flexDirection: 'row',
                          backgroundColor: isEvenRow ? '#ffffff' : 'rgba(248,249,251,0.8)',
                          borderBottomWidth: 1, borderBottomColor: 'rgba(195,198,214,0.08)',
                        }}
                      >
                        {/* Columna concepto (fija) */}
                        <View style={{
                          width: COL_W, padding: 12,
                          borderRightWidth: 1, borderRightColor: 'rgba(195,198,214,0.1)',
                          justifyContent: 'center',
                        }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#191c1e', lineHeight: 15 }} numberOfLines={2}>
                            {concepto.descripcion}
                          </Text>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#003d9b', marginTop: 2 }}>
                            ${concepto.costo_unitario.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </Text>
                        </View>

                        {/* Celdas interactivas */}
                        {Array.from({ length: colCount }, (_, colIdx) => {
                          const acumTotal = cantAnterior + cantEsta;
                          const isAnterior = colIdx < cantAnterior;   // estimaciones previas
                          const isEsta = colIdx >= cantAnterior && colIdx < acumTotal; // esta estimación
                          const isDone = isAnterior || isEsta;

                          return (
                            <TouchableOpacity
                              key={colIdx}
                              style={{
                                width: CELL_W,
                                padding: 4,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              onPress={() => handleCellTap(concepto, colIdx)}
                              onLongPress={() => handleLongPress(concepto)}
                              delayLongPress={500}
                              activeOpacity={0.7}
                            >
                              <View style={{
                                width: CELL_W - 8,
                                aspectRatio: 1,
                                borderRadius: 4,
                                backgroundColor: isDone
                                  ? (isEsta ? '#004f11' : '#166921')
                                  : '#e1e2e4',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                {isEsta && (
                                  <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
                                    {currentWeek}
                                  </Text>
                                )}
                                {isAnterior && (
                                  <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
                                    {colIdx + 1}
                                  </Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              ))}

              {/* Total row */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingHorizontal: 14, paddingVertical: 12,
                  backgroundColor: 'rgba(231,232,234,0.4)',
                  borderTopWidth: 1, borderTopColor: 'rgba(195,198,214,0.15)',
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#434654', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Total Estimado
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#003d9b' }}>
                    ${totales.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                  <MaterialIcons name="chevron-right" size={16} color="#737685" />
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      {/* ── Botones Evidencia / Croquis ── */}
      <View style={{
        paddingHorizontal: 16, paddingVertical: 10,
        flexDirection: 'row', gap: 10,
        backgroundColor: 'rgba(248,249,251,0.8)',
      }}>
        {[
          { icon: 'add-a-photo', label: 'Evidencia', route: `/evidencia/${estId}` },
          { icon: 'map', label: 'Croquis', route: `/croquis/${estId}` },
        ].map(({ icon, label, route }) => (
          <TouchableOpacity
            key={label}
            onPress={() => router.push(route as any)}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 6, paddingVertical: 9,
              backgroundColor: '#ffffff', borderRadius: 6,
              borderWidth: 1, borderColor: 'rgba(195,198,214,0.25)',
              shadowColor: '#191c1e', shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
            }}
            activeOpacity={0.85}
          >
            <MaterialIcons name={icon as any} size={16} color="#003d9b" />
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#003d9b', textTransform: 'uppercase', letterSpacing: 1 }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Bottom Nav ── */}
      <View style={{
        flexDirection: 'row', backgroundColor: '#ffffff',
        paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16,
        paddingTop: 12,
        shadowColor: '#191c1e', shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.06, shadowRadius: 16, elevation: 8,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
      }}>
        {/* Subtotal */}
        <View style={{
          flex: 1.5, flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#003d9b', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10,
          marginRight: 8,
        }}>
          <MaterialIcons name="calculate" size={16} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>
            Subtotal
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '700' }}>
            ${(totales.subtotal / 1000).toFixed(1)}k
          </Text>
        </View>

        {/* Guardar */}
        <TouchableOpacity
          onPress={handleGuardar}
          disabled={saving}
          style={{
            flex: 1, alignItems: 'center', justifyContent: 'center',
            paddingVertical: 8,
          }}
          activeOpacity={0.7}
        >
          {saving
            ? <ActivityIndicator size="small" color="#003d9b" />
            : <MaterialIcons name="save" size={20} color="#191c1e" />
          }
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#191c1e', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>
            Guardar
          </Text>
        </TouchableOpacity>

        {/* PDF */}
        <TouchableOpacity
          onPress={() => router.push(`/pdf/soporte/${estId}` as any)}
          style={{
            flex: 1, alignItems: 'center', justifyContent: 'center',
            paddingVertical: 8,
          }}
          activeOpacity={0.7}
        >
          <MaterialIcons name="picture-as-pdf" size={20} color="#191c1e" />
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#191c1e', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>
            PDF
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Input Manual Modal ── */}
      <InputModal
        visible={modalVisible}
        concepto={modalConcepto}
        valorActual={modalConcepto ? (detalles[modalConcepto.id]?.cantidad_esta_est ?? 0) : 0}
        onConfirm={handleModalConfirm}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}
