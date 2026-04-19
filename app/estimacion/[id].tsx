/**
 * estimacion/[id].tsx
 * PANTALLA 1: Grid de Realización de Estimación.
 * Conceptos × Unidades (1…N). Tap = toggle, long press = input manual.
 *
 * Issues implementados:
 * #1  - Conceptos bloqueados de estimaciones previas (badge S.X)
 * #2  - Modo Actualización con selección individual por celda
 * #5  - Bloqueo por totalidad en Modo Actualización (badge COMPL.)
 * #6  - Borrar estimación + reordenar consecutivos
 * #14 - Columna ANT editable en resumen antes de guardar
 */

import {
  View, Text, TouchableOpacity, ScrollView, FlatList,
  ActivityIndicator, Modal, TextInput, Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initDatabase,
  getEstimacionById,
  getProyectoById,
  getConceptosByProyecto,
  getDetallesByEstimacion,
  upsertDetalle,
  recalcularTotalesEstimacion,
  deleteEstimacion,
  updateCellStates,
  updateEstimNumero,
  getCantidadesAnteriores,
} from '../../db/database';
import type { CellState } from '../../db/schema';
import { requestCloudBackup } from '../../utils/dataSync';

// ─── AsyncStorage key ──────────────────────────────────────────────────────────

const ASYNC_LAST_ESTIM_NUMBER = 'lastEstimNumber';

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
  cell_state: CellState;
}

interface DetalleMap {
  [conceptoId: number]: Detalle;
}

interface PriorData {
  [conceptoId: number]: { cantidad: number; semana: number };
}

const emptyDetalle = (conceptoId: number): Detalle => ({
  concepto_id: conceptoId,
  cantidad_anterior: 0,
  cantidad_esta_est: 0,
  cantidad_acumulada: 0,
  importe_esta_est: 0,
  avance_financiero: 0,
  cell_state: 'empty',
});

// ─── BUG-3: Shared styles (defined outside render to preserve referential equality) ──

const ROW_HEIGHT = 60;
const rowStyleEven = { flexDirection: 'row' as const, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: 'rgba(195,198,214,0.08)' };
const rowStyleOdd = { flexDirection: 'row' as const, backgroundColor: 'rgba(248,249,251,0.8)', borderBottomWidth: 1, borderBottomColor: 'rgba(195,198,214,0.08)' };
const conceptColStyle = { padding: 10, borderRightWidth: 1, borderRightColor: 'rgba(195,198,214,0.1)', justifyContent: 'center' as const };
const cellOuterStyle = { padding: 4, alignItems: 'center' as const, justifyContent: 'center' as const };
const cellInnerBase = { borderRadius: 4, alignItems: 'center' as const, justifyContent: 'center' as const };

// ─── BUG-3: Memoized ConceptoRow ──────────────────────────────────────────────

interface ConceptoRowProps {
  concepto: Concepto;
  detalle: Detalle | undefined;
  priorLocked: number;
  priorSemana: number;
  isEvenRow: boolean;
  colCount: number;
  cellW: number;
  colW: number;
  modoActualizacion: boolean;
  isViewMode: boolean;
  currentWeek: number;
  onCellTap: (concepto: Concepto, colIdx: number) => void;
  onLongPress: (concepto: Concepto) => void;
  onMarcarTodo: (concepto: Concepto) => void;
  onDesmarcarTodo: (concepto: Concepto) => void;
  rowKey: string;
  registerScrollRef: (key: string, ref: any) => void;
  onHorizontalScroll: (x: number, selfKey: string) => void;
}

const ConceptoRow = React.memo(function ConceptoRow({
  concepto, detalle, priorLocked, priorSemana, isEvenRow,
  colCount, cellW, colW, modoActualizacion, isViewMode, currentWeek,
  onCellTap, onLongPress, onMarcarTodo, onDesmarcarTodo,
  rowKey, registerScrollRef, onHorizontalScroll,
}: ConceptoRowProps) {
  const modeActAdditions = detalle?.cantidad_anterior ?? 0;
  const effectiveAnterior = priorLocked + modeActAdditions;
  const cantEsta = detalle?.cantidad_esta_est ?? 0;
  const isFullyBlocked = effectiveAnterior >= concepto.factor;

  const getCellVisual = (colIdx: number): { bg: string; text: string | null; blocked: boolean; badgeText: string | null } => {
    if (colIdx < priorLocked) {
      return { bg: '#1A7A3C', text: null, blocked: true, badgeText: priorSemana > 0 ? `S.${priorSemana}` : null };
    }
    if (colIdx < effectiveAnterior) {
      if (modoActualizacion) {
        return { bg: '#2196F3', text: null, blocked: false, badgeText: null };
      }
      return { bg: '#1A7A3C', text: null, blocked: true, badgeText: null };
    }
    if (colIdx < effectiveAnterior + cantEsta) {
      return { bg: '#4CAF50', text: String(currentWeek), blocked: modoActualizacion, badgeText: null };
    }
    return { bg: '#E0E0E0', text: null, blocked: false, badgeText: null };
  };

  const getUpdateCounter = (): string => {
    const available = concepto.factor - priorLocked - cantEsta;
    return `${modeActAdditions}/${available}`;
  };

  return (
    <View style={isEvenRow ? rowStyleEven : rowStyleOdd}>
      {/* Columna concepto (fija) */}
      <View style={[conceptColStyle, { width: colW }]}>
        {/* Modo Actualizacion controles */}
        {modoActualizacion && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <TouchableOpacity
                onPress={() => onMarcarTodo(concepto)}
                style={{ borderWidth: 1, borderColor: '#2196F3', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}
              >
                <Text style={{ fontSize: 8, fontWeight: '700', color: '#2196F3', textTransform: 'uppercase' }}>Marcar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onDesmarcarTodo(concepto)}
                style={{ borderWidth: 1, borderColor: '#D32F2F', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}
              >
                <Text style={{ fontSize: 8, fontWeight: '700', color: '#D32F2F', textTransform: 'uppercase' }}>Desmarcar</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#2196F3' }}>{getUpdateCounter()}</Text>
          </View>
        )}
        {/* Paquete / sub-paquete prefix — facilita localizar conceptos.
            Extrae sólo el número (antes del " - ") para compactarlo. Maneja
            backward compat: si paquete/subpaquete son null o '' simplemente
            se omiten. */}
        {(() => {
          const paqRaw = (concepto.paquete || '').trim();
          const subRaw = (concepto.subpaquete || '').trim();
          const paqNum = paqRaw ? (paqRaw.split(' - ')[0] || '').trim() : '';
          const subNum = subRaw ? (subRaw.split(' - ')[0] || '').trim() : '';
          let prefix = '';
          if (paqNum && subNum) prefix = `${paqNum}.${subNum}`;
          else if (paqNum) prefix = paqNum;
          else if (subNum) prefix = subNum;
          if (!prefix) return null;
          return (
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#737685', marginBottom: 1 }}>
              {prefix}
            </Text>
          );
        })()}
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#191c1e', lineHeight: 15 }} numberOfLines={2}>
          {concepto.descripcion}
        </Text>
        <Text style={{ fontSize: 9, fontWeight: '600', color: '#003d9b', marginTop: 2 }}>
          ${concepto.costo_unitario.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
        </Text>
        <Text style={{
          fontSize: 10, fontWeight: '700', marginTop: 2,
          color: (effectiveAnterior + cantEsta) >= concepto.factor ? '#004f11' : (effectiveAnterior + cantEsta) > 0 ? '#003d9b' : '#737685',
        }}>
          {effectiveAnterior + cantEsta}/{concepto.factor}
        </Text>
        {priorLocked > 0 && !modoActualizacion && (
          <Text style={{ fontSize: 8, fontWeight: '600', color: '#737685', marginTop: 1 }}>
            ({priorLocked} EST. PREV)
          </Text>
        )}
        {isFullyBlocked && !modoActualizacion && (
          <View style={{ backgroundColor: '#1A7A3C', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, marginTop: 2, alignSelf: 'flex-start' }}>
            <Text style={{ color: '#ffffff', fontSize: 7, fontWeight: '800' }}>COMPL.</Text>
          </View>
        )}
      </View>

      {/* Celdas interactivas - ScrollView horizontal sincronizado con header y otras filas */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        ref={(ref) => registerScrollRef(rowKey, ref)}
        onScroll={(e) => onHorizontalScroll(e.nativeEvent.contentOffset.x, rowKey)}
        scrollEventThrottle={16}
        decelerationRate="fast"
      >
        <View style={{ flexDirection: 'row' }}>
          {Array.from({ length: colCount }, (_, colIdx) => {
            const { bg, text, blocked, badgeText } = getCellVisual(colIdx);
            return (
              <TouchableOpacity
                key={colIdx}
                style={[cellOuterStyle, { width: cellW }]}
                onPress={() => onCellTap(concepto, colIdx)}
                onLongPress={() => onLongPress(concepto)}
                delayLongPress={500}
                activeOpacity={blocked ? 1 : 0.7}
              >
                <View style={[cellInnerBase, { width: cellW - 8, aspectRatio: 1, backgroundColor: bg }]}>
                  {text !== null && (
                    <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>{text}</Text>
                  )}
                  {badgeText !== null && (
                    <View style={{ position: 'absolute', top: 1, right: 1, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 2, paddingHorizontal: 2, paddingVertical: 0.5 }}>
                      <Text style={{ color: '#ffffff', fontSize: 6, fontWeight: '700' }}>{badgeText}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}, (prev, next) => {
  // Only re-render if this row's relevant data changed
  return (
    prev.detalle === next.detalle &&
    prev.priorLocked === next.priorLocked &&
    prev.priorSemana === next.priorSemana &&
    prev.concepto.id === next.concepto.id &&
    prev.modoActualizacion === next.modoActualizacion &&
    prev.isViewMode === next.isViewMode &&
    prev.isEvenRow === next.isEvenRow &&
    prev.colCount === next.colCount
  );
});

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

// ─── Summary Modal (Issue #14) ─────────────────────────────────────────────────

function SummaryModal({
  visible, conceptos, detalles, priorData, proyecto,
  onConfirm, onClose,
}: {
  visible: boolean;
  conceptos: Concepto[];
  detalles: DetalleMap;
  priorData: PriorData;
  proyecto: any;
  onConfirm: (antOverrides: Record<number, number>) => void;
  onClose: () => void;
}) {
  const [antEdits, setAntEdits] = useState<Record<number, string>>({});

  useEffect(() => {
    if (visible) setAntEdits({});
  }, [visible]);

  const activeConceptos = conceptos.filter(c => {
    const det = detalles[c.id];
    const cantEsta = det?.cantidad_esta_est ?? 0;
    // BUG-1: Solo mostrar conceptos con importe del periodo actual > 0
    return cantEsta * c.costo_unitario > 0;
  });

  // Calculate totals for summary display
  const summarySubtotal = activeConceptos.reduce((sum, c) => {
    const det = detalles[c.id];
    const cantEsta = det?.cantidad_esta_est ?? 0;
    return sum + cantEsta * c.costo_unitario;
  }, 0);

  const summaryMontoANT = conceptos.reduce((sum, c) => {
    const modeActAdd = detalles[c.id]?.cantidad_anterior ?? 0;
    return sum + modeActAdd * c.costo_unitario;
  }, 0);

  const summaryEstimadoPrevio = conceptos.reduce((sum, c) => {
    const priorLocked = priorData[c.id]?.cantidad ?? 0;
    return sum + priorLocked * c.costo_unitario;
  }, 0);

  const handleConfirm = () => {
    const overrides: Record<number, number> = {};
    for (const c of activeConceptos) {
      const priorLocked = priorData[c.id]?.cantidad ?? 0;
      const det = detalles[c.id];
      const defaultAnt = priorLocked + (det?.cantidad_anterior ?? 0);
      const editedStr = antEdits[c.id];
      if (editedStr !== undefined) {
        const parsed = parseFloat(editedStr.replace(',', '.'));
        overrides[c.id] = isNaN(parsed) || parsed < 0 ? defaultAnt : parsed;
      } else {
        overrides[c.id] = defaultAnt;
      }
    }
    onConfirm(overrides);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(25,28,30,0.5)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: 16, paddingBottom: 40, maxHeight: '80%',
        }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#191c1e', marginBottom: 12 }}>
            Resumen de Estimación
          </Text>

          {/* Table header */}
          <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' }}>
            <Text style={{ flex: 2, fontSize: 9, fontWeight: '700', color: '#737685', textTransform: 'uppercase' }}>Concepto</Text>
            <Text style={{ flex: 1, fontSize: 9, fontWeight: '700', color: '#737685', textAlign: 'center', textTransform: 'uppercase' }}>Ant</Text>
            <Text style={{ flex: 1, fontSize: 9, fontWeight: '700', color: '#737685', textAlign: 'center', textTransform: 'uppercase' }}>Esta Est.</Text>
            <Text style={{ flex: 1.2, fontSize: 9, fontWeight: '700', color: '#737685', textAlign: 'right', textTransform: 'uppercase' }}>Importe</Text>
          </View>

          <ScrollView style={{ maxHeight: 400 }}>
            {activeConceptos.map(c => {
              const priorLocked = priorData[c.id]?.cantidad ?? 0;
              const det = detalles[c.id];
              const defaultAnt = priorLocked + (det?.cantidad_anterior ?? 0);
              const cantEsta = det?.cantidad_esta_est ?? 0;
              const antStr = antEdits[c.id] ?? String(defaultAnt);
              const antVal = parseFloat(antStr.replace(',', '.')) || 0;
              const exceeds = antVal + cantEsta > c.factor;
              const belowMin = antVal < priorLocked;
              const hasError = exceeds || belowMin;
              const importe = cantEsta * c.costo_unitario;

              return (
                <View key={c.id} style={{
                  flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
                  borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
                }}>
                  <View style={{ flex: 2, paddingRight: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#191c1e' }} numberOfLines={2}>
                      {c.descripcion}
                    </Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput
                      value={antStr}
                      onChangeText={text => {
                        const clean = text.replace(/[^0-9.,]/g, '');
                        setAntEdits(prev => ({ ...prev, [c.id]: clean }));
                      }}
                      keyboardType="decimal-pad"
                      style={{
                        fontSize: 12, fontWeight: '700', color: '#191c1e',
                        backgroundColor: '#f3f4f6', borderRadius: 4,
                        paddingHorizontal: 6, paddingVertical: 4,
                        textAlign: 'center', minWidth: 40,
                        borderWidth: hasError ? 1.5 : 0,
                        borderColor: hasError ? '#D32F2F' : 'transparent',
                      }}
                    />
                  </View>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#191c1e', textAlign: 'center' }}>
                    {cantEsta}
                  </Text>
                  <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: '#003d9b', textAlign: 'right' }}>
                    ${importe.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Totals summary */}
          <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e0e0e0' }}>
            {summaryMontoANT > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#2196F3' }}>Importe ANT (esta sesion)</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#2196F3' }}>
                  ${summaryMontoANT.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#191c1e' }}>Subtotal esta estimacion</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#004f11' }}>
                ${summarySubtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f3f4f6', borderRadius: 6, padding: 8, marginTop: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#003d9b' }}>Monto Restante</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#003d9b' }}>
                ${((proyecto?.monto_contrato ?? 0) - summaryEstimadoPrevio - summaryMontoANT - summarySubtotal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          {/* Buttons */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{ flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10, paddingVertical: 13, alignItems: 'center' }}
            >
              <Text style={{ color: '#737685', fontWeight: '700' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              style={{ flex: 2, backgroundColor: '#003d9b', borderRadius: 10, paddingVertical: 13, alignItems: 'center' }}
            >
              <Text style={{ color: '#ffffff', fontWeight: '700' }}>Guardar Estimación</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Pantalla Principal ────────────────────────────────────────────────────────

export default function EstimacionGrid() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const estId = Number(id);
  const isViewMode = mode === 'view';

  const [estimacion, setEstimacion]  = useState<any>(null);
  const [proyecto, setProyecto]      = useState<any>(null);
  const [conceptos, setConceptos]    = useState<Concepto[]>([]);
  const [detalles, setDetalles]      = useState<DetalleMap>({});
  const [priorData, setPriorData]    = useState<PriorData>({});
  const [loading, setLoading]        = useState(true);
  const [saving, setSaving]          = useState(false);
  const [totales, setTotales]        = useState({ subtotal: 0, retencion: 0, totalAPagar: 0 });

  // Est. #X editable
  const [estimNumber, setEstimNumber]         = useState<string>('1');
  const [editingEstimNum, setEditingEstimNum] = useState(false);
  const estimNumInputRef = useRef<TextInput>(null);

  // Kebab menu
  const [menuVisible, setMenuVisible] = useState(false);

  // Modo Actualización
  const [modoActualizacion, setModoActualizacion] = useState(false);
  const [updatePending, setUpdatePending] = useState<Record<number, boolean>>({});

  // Modal input manual
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConcepto, setModalConcepto] = useState<Concepto | null>(null);

  // Summary modal (Issue #14)
  const [summaryVisible, setSummaryVisible] = useState(false);

  // Filtro solo disponibles (Task 8b)
  const [soloDisponibles, setSoloDisponibles] = useState(false);

  // ── Carga inicial ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      await initDatabase();
      const est = await getEstimacionById(estId);
      if (!est) {
        Alert.alert('Error', 'No se encontro la estimacion. Regresa e intenta de nuevo.');
        router.back();
        return;
      }

      const proy = await getProyectoById(est.proyecto_id);
      if (!proy) {
        Alert.alert('Error', 'No se encontro el proyecto asociado.');
        router.back();
        return;
      }

      const concs = await getConceptosByProyecto(est.proyecto_id) as Concepto[];
      const dets = await getDetallesByEstimacion(estId);
      const prior = await getCantidadesAnteriores(est.proyecto_id, estId);

      const detMap: DetalleMap = {};
      for (const d of dets) {
        detMap[d.concepto_id] = {
          ...d,
          cell_state: (d.cell_state as CellState) ?? 'empty',
        };
      }

      setEstimacion(est);
      setProyecto(proy);
      setConceptos(concs);
      setDetalles(detMap);
      setPriorData(prior);
      setEstimNumber(String(est.numero ?? 1));
      setTotales({
        subtotal: est.subtotal || 0,
        retencion: est.retencion || 0,
        totalAPagar: est.total_a_pagar || 0,
      });
    } catch (e) {
      Alert.alert('Error al cargar', 'Ocurrio un error inesperado. Regresa e intenta de nuevo.');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [estId]);

  useEffect(() => { load(); }, []);

  // ── Est. #X editable ───────────────────────────────────────────────────────
  const handleEstimNumberBlur = async () => {
    setEditingEstimNum(false);
    const parsed = parseInt(estimNumber, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setEstimNumber(String(estimacion?.numero ?? 1));
      return;
    }
    await AsyncStorage.setItem(ASYNC_LAST_ESTIM_NUMBER, String(parsed));
    await updateEstimNumero(estId, parsed);
    setEstimacion((prev: any) => prev ? { ...prev, numero: parsed } : prev);
  };

  const handleEstimNumberChange = (text: string) => {
    const clean = text.replace(/[^0-9]/g, '');
    setEstimNumber(clean);
  };

  // ── Actualizar cantidad (normal mode) ──────────────────────────────────────
  const updateCantidad = useCallback(async (concepto: Concepto, nuevaCantidad: number) => {
    const modeActAdditions = detalles[concepto.id]?.cantidad_anterior ?? 0;

    setDetalles(prev => ({
      ...prev,
      [concepto.id]: {
        concepto_id: concepto.id,
        cantidad_anterior: modeActAdditions,
        cantidad_esta_est: nuevaCantidad,
        cantidad_acumulada: modeActAdditions + nuevaCantidad,
        importe_esta_est: nuevaCantidad * concepto.costo_unitario,
        avance_financiero: concepto.factor > 0
          ? ((modeActAdditions + nuevaCantidad) / concepto.factor) * 100
          : 0,
        cell_state: nuevaCantidad > 0 ? 'current' : (modeActAdditions > 0 ? 'estimated_prior' : 'empty'),
      },
    }));

    await upsertDetalle(estId, concepto.id, modeActAdditions, nuevaCantidad, concepto.costo_unitario);
    const t = await recalcularTotalesEstimacion(estId);
    setTotales(t);
  }, [estId, detalles]);

  // ── handleCellTap — Issues #1, #2, #5 ─────────────────────────────────────
  const handleCellTap = useCallback((concepto: Concepto, colIdx: number) => {
    if (isViewMode) return;

    const priorLocked = priorData[concepto.id]?.cantidad ?? 0;
    const modeActAdditions = detalles[concepto.id]?.cantidad_anterior ?? 0;
    const effectiveAnterior = priorLocked + modeActAdditions;
    const cantEsta = detalles[concepto.id]?.cantidad_esta_est ?? 0;

    // ── Modo Actualización: selección individual (Issue #2) ──
    if (modoActualizacion) {
      // Prior locked: untouchable
      if (colIdx < priorLocked) return;
      // Current cells: untouchable in mode actualización
      if (colIdx >= effectiveAnterior && colIdx < effectiveAnterior + cantEsta) return;

      if (colIdx < effectiveAnterior) {
        // Tap on mode-act cell → decrement
        if (modeActAdditions <= 0) return;
        setDetalles(prev => ({
          ...prev,
          [concepto.id]: {
            ...(prev[concepto.id] ?? emptyDetalle(concepto.id)),
            cantidad_anterior: modeActAdditions - 1,
            cell_state: (modeActAdditions - 1) > 0 ? 'estimated_prior' : (cantEsta > 0 ? 'current' : 'empty'),
          },
        }));
        setUpdatePending(prev => ({ ...prev, [concepto.id]: true }));
      } else {
        // Tap on empty cell → increment mode act
        const maxModeAct = concepto.factor - priorLocked - cantEsta;
        if (modeActAdditions < maxModeAct) {
          setDetalles(prev => ({
            ...prev,
            [concepto.id]: {
              ...(prev[concepto.id] ?? emptyDetalle(concepto.id)),
              cantidad_anterior: modeActAdditions + 1,
              cell_state: 'estimated_prior',
            },
          }));
          setUpdatePending(prev => ({ ...prev, [concepto.id]: true }));
        }
      }
      return;
    }

    // ── Modo Normal ──

    // Issue #5: fully blocked
    if (effectiveAnterior >= concepto.factor) return;

    // Locked cells (prior + mode act)
    if (colIdx < effectiveAnterior) return;

    const adjustedIdx = colIdx - effectiveAnterior;
    if (adjustedIdx < cantEsta) {
      // In current range → decrement
      updateCantidad(concepto, cantEsta - 1);
    } else {
      // Empty → increment
      const maxEsta = concepto.factor - effectiveAnterior;
      if (cantEsta < maxEsta) {
        updateCantidad(concepto, cantEsta + 1);
      }
    }
  }, [isViewMode, modoActualizacion, priorData, detalles, updateCantidad]);

  // Long press = input manual (solo en modo normal)
  const handleLongPress = useCallback((concepto: Concepto) => {
    if (isViewMode || modoActualizacion) return;
    setModalConcepto(concepto);
    setModalVisible(true);
  }, [isViewMode, modoActualizacion]);

  const handleModalConfirm = useCallback((val: number) => {
    if (modalConcepto) updateCantidad(modalConcepto, val);
    setModalVisible(false);
  }, [modalConcepto, updateCantidad]);

  // ── Marcar Todo (mode actualización) ───────────────────────────────────────
  const handleMarcarTodo = useCallback((concepto: Concepto) => {
    const priorLocked = priorData[concepto.id]?.cantidad ?? 0;
    const cantEsta = detalles[concepto.id]?.cantidad_esta_est ?? 0;
    const maxModeAct = concepto.factor - priorLocked - cantEsta;
    if (maxModeAct <= 0) return;
    setDetalles(prev => ({
      ...prev,
      [concepto.id]: {
        ...(prev[concepto.id] ?? emptyDetalle(concepto.id)),
        cantidad_anterior: maxModeAct,
        cell_state: 'estimated_prior',
      },
    }));
    setUpdatePending(prev => ({ ...prev, [concepto.id]: true }));
  }, [priorData, detalles]);

  // ── Desmarcar Todo (mode actualización) ────────────────────────────────────
  const handleDesmarcarTodo = useCallback((concepto: Concepto) => {
    const cantEsta = detalles[concepto.id]?.cantidad_esta_est ?? 0;
    setDetalles(prev => ({
      ...prev,
      [concepto.id]: {
        ...(prev[concepto.id] ?? emptyDetalle(concepto.id)),
        cantidad_anterior: 0,
        cell_state: cantEsta > 0 ? 'current' : 'empty',
      },
    }));
    setUpdatePending(prev => {
      const next = { ...prev };
      delete next[concepto.id];
      return next;
    });
  }, [detalles]);

  // ── Guardar Actualización ──────────────────────────────────────────────────
  const handleGuardarActualizacion = useCallback(async () => {
    setSaving(true);
    const pendingIds = Object.keys(updatePending).map(Number);

    for (const conceptoId of pendingIds) {
      const det = detalles[conceptoId] ?? emptyDetalle(conceptoId);
      const concepto = conceptos.find(c => c.id === conceptoId);
      if (!concepto) continue;
      await upsertDetalle(estId, conceptoId, det.cantidad_anterior, det.cantidad_esta_est, concepto.costo_unitario);
      const cellState: CellState = det.cantidad_anterior > 0 ? 'estimated_prior' : (det.cantidad_esta_est > 0 ? 'current' : 'empty');
      await updateCellStates(estId, conceptoId, cellState, concepto.costo_unitario);
    }

    const t = await recalcularTotalesEstimacion(estId);
    setTotales(t);

    // Reload detalles from DB
    const dets = await getDetallesByEstimacion(estId);
    const detMap: DetalleMap = {};
    for (const d of dets) {
      detMap[d.concepto_id] = { ...d, cell_state: (d.cell_state as CellState) ?? 'empty' };
    }
    setDetalles(detMap);

    setUpdatePending({});
    setModoActualizacion(false);
    setSaving(false);
  }, [updatePending, detalles, conceptos, estId]);

  // ── Borrar estimación (Issue #6) ───────────────────────────────────────────
  const handleBorrarEstimacion = useCallback(() => {
    setMenuVisible(false);
    Alert.alert(
      '¿Estás seguro?',
      '¿Deseas borrar esta estimación? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            await deleteEstimacion(estId);
            router.back();
          },
        },
      ]
    );
  }, [estId]);

  // ── Activar Modo Actualización ─────────────────────────────────────────────
  const handleActivarModoActualizacion = useCallback(() => {
    setMenuVisible(false);
    setUpdatePending({});
    setModoActualizacion(true);
  }, []);

  // ── Guardar normal → muestra resumen (Issue #14) ───────────────────────────
  const handleGuardar = useCallback(() => {
    setSummaryVisible(true);
  }, []);

  // ── Summary confirm (Issue #14) ────────────────────────────────────────────
  const handleSummaryConfirm = useCallback(async (antOverrides: Record<number, number>) => {
    setSaving(true);
    setSummaryVisible(false);

    for (const c of conceptos) {
      const priorLocked = priorData[c.id]?.cantidad ?? 0;
      const det = detalles[c.id];
      const cantEsta = det?.cantidad_esta_est ?? 0;

      // antOverrides[c.id] = full ANT (priorLocked + modeAct) from summary
      const fullAnt = antOverrides[c.id];
      if (fullAnt === undefined && cantEsta === 0) continue;

      let modeActAdditions = fullAnt !== undefined
        ? Math.max(0, fullAnt - priorLocked)
        : (det?.cantidad_anterior ?? 0);

      // Clamp: can't exceed factor
      modeActAdditions = Math.min(modeActAdditions, Math.max(0, c.factor - priorLocked - cantEsta));

      if (cantEsta > 0 || modeActAdditions > 0) {
        await upsertDetalle(estId, c.id, modeActAdditions, cantEsta, c.costo_unitario);
        const cellState: CellState = cantEsta > 0 ? 'current' : 'estimated_prior';
        await updateCellStates(estId, c.id, cellState, c.costo_unitario);
      }
    }

    const t = await recalcularTotalesEstimacion(estId);
    setTotales(t);

    // Reload detalles
    const dets = await getDetallesByEstimacion(estId);
    const detMap: DetalleMap = {};
    for (const d of dets) {
      detMap[d.concepto_id] = { ...d, cell_state: (d.cell_state as CellState) ?? 'empty' };
    }
    setDetalles(detMap);

    setSaving(false);

    // Backup a Supabase (fire-and-forget, debounced, silencioso).
    // Se dispara tras guardar exitoso para que la data persista aun si el
    // usuario desinstala la app.
    try {
      const uid = await AsyncStorage.getItem('@estimafacil:user_id');
      if (uid && uid.indexOf('@') >= 0) requestCloudBackup(uid);
    } catch (_) {}

    Alert.alert('Guardado', 'La estimación fue guardada correctamente.');
  }, [conceptos, priorData, detalles, estId]);

  // ── Scroll horizontal sincronizado del grid ─────────────────────────────────
  // Todas las filas + el header comparten un mismo offset horizontal, sincronizado
  // imperativamente vía refs (sin re-renders).
  const gridScrollRefs = useRef<Map<string, any>>(new Map());
  const lastScrollX = useRef(0);
  // Lock para evitar feedback loop entre scrolls programáticos y onScroll.
  // Cuando hacemos scrollTo() sobre las otras filas, ellas emiten su propio
  // onScroll que volvería a llamar handleHorizontalScroll → backscroll/jitter.
  const isSyncing = useRef<boolean>(false);

  const registerScrollRef = useCallback((key: string, ref: any) => {
    if (ref) {
      gridScrollRefs.current.set(key, ref);
      // Al montarse una nueva fila (post virtualización), sincronizar al offset actual
      if (lastScrollX.current > 0) {
        ref.scrollTo({ x: lastScrollX.current, animated: false });
      }
    } else {
      // Callback ref con null = unmount
      gridScrollRefs.current.delete(key);
    }
  }, []);

  const handleHorizontalScroll = useCallback((x: number, selfKey: string) => {
    // Si este onScroll fue causado por un scrollTo() programático que
    // nosotros disparamos, ignorarlo: rompe el feedback loop.
    if (isSyncing.current) return;
    lastScrollX.current = x;
    isSyncing.current = true;
    gridScrollRefs.current.forEach((ref, key) => {
      if (key !== selfKey && ref) {
        ref.scrollTo({ x, animated: false });
      }
    });
    // Liberar el lock en el siguiente frame, para garantizar que todos
    // los onScroll programáticos ya se hayan emitido (y descartado).
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, []);

  // ── Filtrar conceptos (Task 8b) ────────────────────────────────────────────────
  // IMPORTANT: useMemo MUST be called before any early return (Rules of Hooks).
  const conceptosFiltrados = useMemo(() => {
    if (!soloDisponibles) return conceptos;
    return conceptos.filter(c => {
      const eff = (detalles[c.id]?.cantidad_anterior ?? 0) + (priorData[c.id]?.cantidad ?? 0);
      return eff < c.factor;
    });
  }, [soloDisponibles, conceptos, detalles, priorData]);

  // ── Lista plana: headers de paquete + conceptos intercalados ─────────────────
  // Esto permite que un SOLO FlatList (sin ScrollView padre) virtualice todo.
  // IMPORTANT: useMemo MUST be called before any early return (Rules of Hooks).
  type FlatItem =
    | { type: 'header'; nombre: string; key: string }
    | { type: 'concepto'; data: Concepto; idx: number; key: string };

  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    let lastPaq = '';
    let idxInPaq = 0;
    for (const c of conceptosFiltrados) {
      if (c.paquete !== lastPaq) {
        items.push({ type: 'header', nombre: c.paquete, key: `hdr-${c.paquete}` });
        lastPaq = c.paquete;
        idxInPaq = 0;
      }
      items.push({ type: 'concepto', data: c, idx: idxInPaq, key: `c-${c.id}` });
      idxInPaq++;
    }
    return items;
  }, [conceptosFiltrados]);

  // ── Header colCount: max factor entre los conceptos filtrados ───────────────
  // El header (labels 1..N) debe llegar al máximo factor de cualquier concepto
  // visible, para que ningún row se quede sin labels en su parte derecha.
  // IMPORTANT: useMemo MUST be called before any early return (Rules of Hooks).
  const headerColCount = useMemo(() => {
    if (conceptosFiltrados.length === 0) return 1;
    let max = 0;
    for (const c of conceptosFiltrados) {
      if (c.factor > max) max = c.factor;
    }
    return max > 0 ? max : 1;
  }, [conceptosFiltrados]);

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
  // El header usa el factor MÁXIMO entre los conceptos filtrados (cubre
  // contratos con cualquier número de casas/unidades — sin cap artificial).
  // Cada row usa su propio `concepto.factor` como colCount (ver renderItem).
  const colCount = headerColCount;
  const CELL_W = 42;
  const COL_W = 170;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>

      {/* ── Banner Modo Actualización ── */}
      {modoActualizacion && !isViewMode && (
        <View style={{
          backgroundColor: '#0D47A1', paddingVertical: 10, paddingHorizontal: 16,
          alignItems: 'center',
        }}>
          <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
            MODO ACTUALIZACIÓN ACTIVO
          </Text>
        </View>
      )}

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
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#737685', textTransform: 'uppercase', letterSpacing: 0.5 }} numberOfLines={1} ellipsizeMode="tail">
              {proyecto?.nombre?.split('—')[1]?.trim() ?? proyecto?.nombre}
            </Text>
          </View>
        </View>
        {/* Kebab menu - hidden in view mode */}
        {!isViewMode && (
          <TouchableOpacity
            style={{ padding: 6, borderRadius: 99 }}
            onPress={() => setMenuVisible(true)}
          >
            <MaterialIcons name="more-vert" size={22} color="#003d9b" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Kebab Menu Modal ── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={{
            position: 'absolute', top: 60, right: 16,
            backgroundColor: '#ffffff',
            borderRadius: 8,
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15, shadowRadius: 10, elevation: 8,
            minWidth: 220,
          }}>
            <TouchableOpacity
              style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
              onPress={handleActivarModoActualizacion}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#191c1e' }}>Modo Actualización</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingHorizontal: 16, paddingVertical: 14 }}
              onPress={handleBorrarEstimacion}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#D32F2F' }}>Borrar esta estimación</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
              ${((() => {
                const montoANT = conceptos.reduce((sum, c) => {
                  const modeActAdd = detalles[c.id]?.cantidad_anterior ?? 0;
                  return sum + modeActAdd * c.costo_unitario;
                }, 0);
                return (proyecto?.monto_contrato - totales.subtotal - montoANT) / 1000;
              })()).toFixed(1)}k
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
          {/* Est. #X editable */}
          <TouchableOpacity
            onPress={() => {
              setEditingEstimNum(true);
              setTimeout(() => estimNumInputRef.current?.focus(), 50);
            }}
            activeOpacity={0.7}
          >
            {editingEstimNum ? (
              <TextInput
                ref={estimNumInputRef}
                value={estimNumber}
                onChangeText={handleEstimNumberChange}
                onBlur={handleEstimNumberBlur}
                keyboardType="number-pad"
                selectTextOnFocus
                style={{
                  fontSize: 11, fontWeight: '700', color: '#003d9b',
                  borderBottomWidth: 1, borderBottomColor: '#003d9b',
                  minWidth: 40, textAlign: 'right', padding: 0,
                }}
              />
            ) : (
              <Text style={{ fontSize: 10, color: '#737685' }}>
                Est. #{estimNumber}
                <Text style={{ color: '#003d9b', fontSize: 9 }}> ✎</Text>
              </Text>
            )}
          </TouchableOpacity>
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
        {/* Leyenda + filtro */}
        <View style={{
          paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: 'rgba(231,232,234,0.2)',
          borderBottomWidth: 1, borderBottomColor: 'rgba(195,198,214,0.15)',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#191c1e' }}>Conceptos</Text>
            <TouchableOpacity
              onPress={() => setSoloDisponibles(prev => !prev)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
                backgroundColor: soloDisponibles ? '#003d9b' : 'transparent',
                borderWidth: soloDisponibles ? 0 : 1,
                borderColor: '#c3c6d6',
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="filter-list" size={14} color={soloDisponibles ? '#ffffff' : '#737685'} />
              <Text style={{ fontSize: 9, fontWeight: '700', color: soloDisponibles ? '#ffffff' : '#737685' }}>
                Solo disponibles
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { color: '#1A7A3C', label: 'ESTIMADO' },
              { color: '#4CAF50', label: 'ACTUAL' },
              { color: '#E0E0E0', label: 'DISPONIBLE' },
            ].map(({ color, label }) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, backgroundColor: color, borderRadius: 2 }} />
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* FlatList como componente RAÍZ de scroll (NO dentro de ScrollView).
            Lista plana: headers de paquete + conceptos mezclados.
            Cada fila maneja su propio scroll horizontal. */}
        <FlatList
          data={flatItems}
          keyExtractor={(item) => item.key}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={30}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          ListHeaderComponent={
            <View style={{ flexDirection: 'row', backgroundColor: 'rgba(231,232,234,0.95)' }}>
              {/* Columna Concepto fija (no scrollea horizontal) */}
              <View style={{
                width: COL_W, paddingVertical: 10, paddingHorizontal: 12,
                borderRightWidth: 1, borderRightColor: 'rgba(195,198,214,0.1)',
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#434654', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Concepto
                </Text>
              </View>
              {/* Labels 1..N con scroll horizontal sincronizado */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                ref={(ref) => registerScrollRef('__header__', ref)}
                onScroll={(e) => handleHorizontalScroll(e.nativeEvent.contentOffset.x, '__header__')}
                scrollEventThrottle={16}
                decelerationRate="fast"
              >
                <View style={{ flexDirection: 'row' }}>
                  {Array.from({ length: colCount }, (_, i) => (
                    <View key={i} style={{ width: CELL_W, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#434654', textTransform: 'uppercase' }}>
                        {i + 1}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <View style={{
                  paddingHorizontal: 12, paddingVertical: 5,
                  backgroundColor: 'rgba(0,61,155,0.06)',
                  borderTopWidth: 1, borderBottomWidth: 1,
                  borderColor: 'rgba(195,198,214,0.2)',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#003d9b', textTransform: 'uppercase', letterSpacing: 1 }}>
                    {item.nombre}
                  </Text>
                </View>
              );
            }
            const concepto = item.data;
            return (
              <ConceptoRow
                concepto={concepto}
                detalle={detalles[concepto.id]}
                priorLocked={priorData[concepto.id]?.cantidad ?? 0}
                priorSemana={priorData[concepto.id]?.semana ?? 0}
                isEvenRow={item.idx % 2 === 0}
                colCount={(concepto.factor && concepto.factor > 0) ? concepto.factor : 1}
                cellW={CELL_W}
                colW={COL_W}
                modoActualizacion={modoActualizacion}
                isViewMode={isViewMode}
                currentWeek={currentWeek}
                onCellTap={handleCellTap}
                onLongPress={handleLongPress}
                onMarcarTodo={handleMarcarTodo}
                onDesmarcarTodo={handleDesmarcarTodo}
                rowKey={item.key}
                registerScrollRef={registerScrollRef}
                onHorizontalScroll={handleHorizontalScroll}
              />
            );
          }}
          ListFooterComponent={
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
          }
        />
      </View>

      {/* ── Botones Evidencia / Croquis (modo normal) ── */}
      {!modoActualizacion && !isViewMode && (
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
      )}

      {/* ── Bottom Nav ── */}
      {!modoActualizacion ? (
        // Modo normal: Subtotal + Guardar + PDF
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

          {/* Guardar - hidden in view mode */}
          {!isViewMode && (
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
          )}

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
      ) : (
        // Modo Actualización — botón único "Guardar Actualización"
        <View style={{
          backgroundColor: '#ffffff',
          paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16,
          paddingTop: 12,
          shadowColor: '#191c1e', shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.06, shadowRadius: 16, elevation: 8,
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
        }}>
          <TouchableOpacity
            onPress={handleGuardarActualizacion}
            disabled={saving}
            style={{
              backgroundColor: '#2196F3', borderRadius: 10,
              paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
            }}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color="#ffffff" />
              : <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Guardar Actualización
                </Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* ── Input Manual Modal ── */}
      <InputModal
        visible={modalVisible}
        concepto={modalConcepto}
        valorActual={modalConcepto ? (detalles[modalConcepto.id]?.cantidad_esta_est ?? 0) : 0}
        onConfirm={handleModalConfirm}
        onClose={() => setModalVisible(false)}
      />

      {/* ── Summary Modal (Issue #14) ── */}
      <SummaryModal
        visible={summaryVisible}
        conceptos={conceptos}
        detalles={detalles}
        priorData={priorData}
        proyecto={proyecto}
        onConfirm={handleSummaryConfirm}
        onClose={() => setSummaryVisible(false)}
      />
    </SafeAreaView>
  );
}
