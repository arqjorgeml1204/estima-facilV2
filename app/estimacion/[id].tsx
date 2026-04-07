/**
 * estimacion/[id].tsx
 * PANTALLA 1: Grid de Realización de Estimación.
 * Conceptos × Unidades (1…N). Tap = toggle, long press = input manual.
 * Fiel al diseño "Blueprint Precision" del Stitch original.
 *
 * Wave 2c: 2d (Borrar + Modo Actualización) + 2e (3 estados) + 2f (Est.#X editable)
 */

import {
  View, Text, TouchableOpacity, ScrollView, SafeAreaView,
  ActivityIndicator, Modal, TextInput, Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getEstimacionById,
  getProyectoById,
  getConceptosByProyecto,
  getDetallesByEstimacion,
  upsertDetalle,
  recalcularTotalesEstimacion,
  deleteEstimacion,
  updateCellStates,
  guardarActualizacion,
  updateEstimNumero,
} from '../../db/database';
import type { CellState } from '../../db/schema';

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

// Mapa de cuántas unidades están en "update_pending" por concepto (UI-only)
interface UpdatePendingMap {
  [conceptoId: number]: boolean; // true = concepto completo marcado en modo actualización
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
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const estId = Number(id);
  const isViewMode = mode === 'view';

  const [estimacion, setEstimacion]  = useState<any>(null);
  const [proyecto, setProyecto]      = useState<any>(null);
  const [conceptos, setConceptos]    = useState<Concepto[]>([]);
  const [detalles, setDetalles]      = useState<DetalleMap>({});
  const [loading, setLoading]        = useState(true);
  const [saving, setSaving]          = useState(false);
  const [totales, setTotales]        = useState({ subtotal: 0, retencion: 0, totalAPagar: 0 });

  // 2f — Est. #X editable
  const [estimNumber, setEstimNumber]       = useState<string>('1');
  const [editingEstimNum, setEditingEstimNum] = useState(false);
  const estimNumInputRef = useRef<TextInput>(null);

  // 2d — Kebab menu
  const [menuVisible, setMenuVisible] = useState(false);

  // 2d — Modo Actualización
  const [modoActualizacion, setModoActualizacion] = useState(false);
  // updatePending: conceptoId → true si el concepto completo está marcado
  const [updatePending, setUpdatePending] = useState<UpdatePendingMap>({});

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
      detMap[d.concepto_id] = {
        ...d,
        cell_state: (d.cell_state as CellState) ?? 'empty',
      };
    }

    setEstimacion(est);
    setProyecto(proy);
    setConceptos(concs);
    setDetalles(detMap);
    setEstimNumber(String(est.numero ?? 1));
    setTotales({
      subtotal: est.subtotal || 0,
      retencion: est.retencion || 0,
      totalAPagar: est.total_a_pagar || 0,
    });
    setLoading(false);
  }, [estId]);

  useEffect(() => { load(); }, []);

  // ── 2f: manejar edición de Est. #X ──────────────────────────────────────────
  const handleEstimNumberBlur = async () => {
    setEditingEstimNum(false);
    const parsed = parseInt(estimNumber, 10);
    if (isNaN(parsed) || parsed <= 0) {
      // valor inválido — revertir al valor actual de la estimación
      setEstimNumber(String(estimacion?.numero ?? 1));
      return;
    }
    // Guardar en AsyncStorage y en SQLite
    await AsyncStorage.setItem(ASYNC_LAST_ESTIM_NUMBER, String(parsed));
    await updateEstimNumero(estId, parsed);
    setEstimacion((prev: any) => prev ? { ...prev, numero: parsed } : prev);
  };

  const handleEstimNumberChange = (text: string) => {
    // Solo permitir dígitos
    const clean = text.replace(/[^0-9]/g, '');
    setEstimNumber(clean);
  };

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
        cell_state: detalles[concepto.id]?.cell_state ?? 'empty',
      },
    }));

    // Persist
    await upsertDetalle(estId, concepto.id, anterior, nuevaCantidad, concepto.costo_unitario);
    const t = await recalcularTotalesEstimacion(estId);
    setTotales(t);
  };

  // ── 2e: handleCellTap con 4 estados ─────────────────────────────────────────
  // Estados:
  //   "estimated"       → celda formal previa — bloqueada, no tocar
  //   "estimated_prior" → celda de Modo Actualización — bloqueada en modo normal
  //   "current"         → seleccionada en esta sesión
  //   "empty"           → disponible
  const handleCellTap = useCallback((concepto: Concepto, colIdx: number) => {
    if (isViewMode) return; // view mode: read-only

    // P1 #5: En Modo Actualización, toggle empty <-> estimated_prior por concepto
    if (modoActualizacion) {
      const det = detalles[concepto.id];
      const persistedState = det?.cell_state ?? 'empty';
      // Solo actuar sobre celdas empty o estimated_prior; current y estimated se ignoran
      if (persistedState === 'current' || persistedState === 'estimated') return;

      if (persistedState === 'empty') {
        // Marcar como estimated_prior
        setDetalles(prev => ({
          ...prev,
          [concepto.id]: {
            ...(prev[concepto.id] ?? {
              concepto_id: concepto.id,
              cantidad_anterior: 0,
              cantidad_esta_est: 0,
              cantidad_acumulada: 0,
              importe_esta_est: 0,
              avance_financiero: 0,
            }),
            cell_state: 'estimated_prior',
          },
        }));
        setUpdatePending(prev => ({ ...prev, [concepto.id]: true }));
      } else if (persistedState === 'estimated_prior') {
        // Desmarcar → empty
        setDetalles(prev => ({
          ...prev,
          [concepto.id]: {
            ...(prev[concepto.id] ?? {
              concepto_id: concepto.id,
              cantidad_anterior: 0,
              cantidad_esta_est: 0,
              cantidad_acumulada: 0,
              importe_esta_est: 0,
              avance_financiero: 0,
            }),
            cell_state: 'empty',
          },
        }));
        setUpdatePending(prev => {
          const next = { ...prev };
          delete next[concepto.id];
          return next;
        });
      }
      return;
    }

    const cantAnterior = detalles[concepto.id]?.cantidad_anterior ?? 0;
    const cantEsta = detalles[concepto.id]?.cantidad_esta_est ?? 0;
    const persistedState = detalles[concepto.id]?.cell_state ?? 'empty';

    // Celdas "estimated" y "estimated_prior" están bloqueadas
    if (persistedState === 'estimated' || persistedState === 'estimated_prior') {
      // Si es de estimación anterior: bloqueado completamente
      if (colIdx < cantAnterior) return;
    }

    const isEstimated = colIdx < cantAnterior;
    const isCurrent = colIdx >= cantAnterior && colIdx < cantAnterior + cantEsta;

    if (isEstimated) {
      return; // bloqueado
    } else if (isCurrent) {
      updateCantidad(concepto, cantEsta - 1);
    } else {
      const max = concepto.factor - cantAnterior;
      if (cantEsta < max) {
        updateCantidad(concepto, cantEsta + 1);
      }
    }
  }, [isViewMode, modoActualizacion, detalles, updateCantidad, setDetalles, setUpdatePending]);

  // Long press = input manual (solo en modo normal)
  const handleLongPress = useCallback((concepto: Concepto) => {
    if (isViewMode) return;
    if (modoActualizacion) return;
    setModalConcepto(concepto);
    setModalVisible(true);
  }, [isViewMode, modoActualizacion]);

  const handleModalConfirm = useCallback((val: number) => {
    if (modalConcepto) updateCantidad(modalConcepto, val);
    setModalVisible(false);
  }, [modalConcepto, updateCantidad]);

  // ── 2d: Modo Actualización — Marcar Todo ─────────────────────────────────────
  // P1 #3 & #4: Solo marcar celdas empty → estimated_prior, no tocar current ni estimated
  const handleMarcarTodo = useCallback((concepto: Concepto) => {
    const det = detalles[concepto.id];
    const state = det?.cell_state ?? 'empty';
    // Solo marcar si está empty (no tocar current ni estimated)
    if (state === 'current' || state === 'estimated') return;
    setDetalles(prev => ({
      ...prev,
      [concepto.id]: {
        ...(prev[concepto.id] ?? {
          concepto_id: concepto.id,
          cantidad_anterior: 0,
          cantidad_esta_est: 0,
          cantidad_acumulada: 0,
          importe_esta_est: 0,
          avance_financiero: 0,
        }),
        cell_state: 'estimated_prior',
      },
    }));
    setUpdatePending(prev => ({
      ...prev,
      [concepto.id]: true,
    }));
  }, [detalles]);

  // P1 #4: Desmarcar Todo — revertir estimated_prior → empty
  const handleDesmarcarTodo = useCallback((concepto: Concepto) => {
    const det = detalles[concepto.id];
    const state = det?.cell_state ?? 'empty';
    // Solo desmarcar si está en estimated_prior
    if (state !== 'estimated_prior') return;
    setDetalles(prev => ({
      ...prev,
      [concepto.id]: {
        ...(prev[concepto.id] ?? {
          concepto_id: concepto.id,
          cantidad_anterior: 0,
          cantidad_esta_est: 0,
          cantidad_acumulada: 0,
          importe_esta_est: 0,
          avance_financiero: 0,
        }),
        cell_state: 'empty',
      },
    }));
    setUpdatePending(prev => {
      const next = { ...prev };
      delete next[concepto.id];
      return next;
    });
  }, [detalles]);

  // ── 2d: Guardar Actualización ─────────────────────────────────────────────────
  const handleGuardarActualizacion = useCallback(async () => {
    setSaving(true);
    const pendingIds = Object.entries(updatePending)
      .filter(([, marked]) => marked)
      .map(([id]) => Number(id));

    const costoMap: Record<number, number> = {};
    for (const c of conceptos) {
      costoMap[c.id] = c.costo_unitario;
    }

    await guardarActualizacion(estId, pendingIds, costoMap);

    // Actualizar estado local: los pending → estimated_prior
    setDetalles(prev => {
      const next = { ...prev };
      for (const cid of pendingIds) {
        next[cid] = {
          ...(next[cid] ?? {
            concepto_id: cid,
            cantidad_anterior: 0,
            cantidad_esta_est: 0,
            cantidad_acumulada: 0,
            importe_esta_est: 0,
            avance_financiero: 0,
          }),
          cell_state: 'estimated_prior',
        };
      }
      return next;
    });

    setUpdatePending({});
    setModoActualizacion(false);
    setSaving(false);
  }, [updatePending, conceptos, estId]);

  // ── 2d: Borrar estimación ─────────────────────────────────────────────────────
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

  // ── 2d: Activar Modo Actualización ────────────────────────────────────────────
  const handleActivarModoActualizacion = useCallback(() => {
    setMenuVisible(false);
    setUpdatePending({});
    setModoActualizacion(true);
  }, []);

  // ── Guardar normal ───────────────────────────────────────────────────────────
  const handleGuardar = useCallback(async () => {
    setSaving(true);
    await recalcularTotalesEstimacion(estId);
    setSaving(false);
    Alert.alert('Guardado', 'La estimación fue guardada correctamente.');
  }, [estId]);

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

  // ── Helper: color de celda ────────────────────────────────────────────────────
  // Estado de la celda (colIdx) para un concepto en modo normal:
  //   estimated_prior → toda la fila es verde oscuro sin número (bloqueada)
  //   estimated       → celdas < cantAnterior (verde oscuro + número)
  //   current         → celdas en rango esta estimación (verde claro + semana)
  //   empty           → resto (gris)
  const getCellVisual = (
    concepto: Concepto,
    colIdx: number,
  ): { bg: string; text: string | null; blocked: boolean } => {
    const det = detalles[concepto.id];
    const cantAnterior = det?.cantidad_anterior ?? 0;
    const cantEsta = det?.cantidad_esta_est ?? 0;
    const persistedState = det?.cell_state ?? 'empty';
    const isPending = updatePending[concepto.id] === true;

    // Modo Actualización: toda la fila marcada → azul
    if (modoActualizacion && isPending) {
      return { bg: '#2196F3', text: null, blocked: false };
    }

    // estimated_prior: toda la fila verde oscuro, sin número
    if (persistedState === 'estimated_prior') {
      return { bg: '#1A7A3C', text: null, blocked: true };
    }

    const isAnterior = colIdx < cantAnterior;
    const isEsta = colIdx >= cantAnterior && colIdx < cantAnterior + cantEsta;

    if (isAnterior) {
      // estimated: verde oscuro + número de semana (colIdx+1 como placeholder)
      return { bg: '#1A7A3C', text: String(colIdx + 1), blocked: true };
    }
    if (isEsta) {
      // current: verde claro + semana actual
      return { bg: '#4CAF50', text: String(currentWeek), blocked: false };
    }
    // empty
    return { bg: '#E0E0E0', text: null, blocked: false };
  };

  // ── Contador Update Mode ──────────────────────────────────────────────────────
  // P1 #3: Solo contar celdas estimated_prior (nuevas en este modo), no current ni estimated
  const getUpdateCounter = (concepto: Concepto): string => {
    const total = concepto.factor;
    const det = detalles[concepto.id];
    const state = det?.cell_state ?? 'empty';
    const marked = state === 'estimated_prior' ? total : 0;
    return `${marked}/${total}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fb' }}>

      {/* ── 2d: Banner Modo Actualización - never shown in view mode ── */}
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
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#737685', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {proyecto?.nombre?.split('—')[1]?.trim() ?? proyecto?.nombre}
            </Text>
          </View>
        </View>
        {/* 2d: Kebab menu button - hidden in view mode */}
        {!isViewMode && (
          <TouchableOpacity
            style={{ padding: 6, borderRadius: 99 }}
            onPress={() => setMenuVisible(true)}
          >
            <MaterialIcons name="more-vert" size={22} color="#003d9b" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── 2d: Kebab Menu Modal ── */}
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
          {/* 2f: Est. #X editable */}
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
        {/* 2e: Leyenda actualizada */}
        <View style={{
          paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: 'rgba(231,232,234,0.2)',
          borderBottomWidth: 1, borderBottomColor: 'rgba(195,198,214,0.15)',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#191c1e' }}>Conceptos</Text>
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

        <ScrollView showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {/* Header de columnas */}
              <View style={{ flexDirection: 'row', backgroundColor: 'rgba(231,232,234,0.5)' }}>
                <View style={{
                  width: COL_W, paddingVertical: 10, paddingHorizontal: 12,
                  borderRightWidth: 1, borderRightColor: 'rgba(195,198,214,0.1)',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#434654', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Concepto
                  </Text>
                </View>
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
                    const isPending = updatePending[concepto.id] === true;

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
                          width: COL_W, padding: 10,
                          borderRightWidth: 1, borderRightColor: 'rgba(195,198,214,0.1)',
                          justifyContent: 'center',
                        }}>
                          {/* 2d: Modo Actualización — fila de controles */}
                          {modoActualizacion && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <View style={{ flexDirection: 'row', gap: 4 }}>
                                {/* Botón MARCAR TODO */}
                                <TouchableOpacity
                                  onPress={() => handleMarcarTodo(concepto)}
                                  style={{
                                    borderWidth: 1, borderColor: '#2196F3', borderRadius: 4,
                                    paddingHorizontal: 6, paddingVertical: 2,
                                  }}
                                >
                                  <Text style={{ fontSize: 8, fontWeight: '700', color: '#2196F3', textTransform: 'uppercase' }}>
                                    Marcar
                                  </Text>
                                </TouchableOpacity>
                                {/* P1 #4: Botón DESMARCAR TODO */}
                                <TouchableOpacity
                                  onPress={() => handleDesmarcarTodo(concepto)}
                                  style={{
                                    borderWidth: 1, borderColor: '#D32F2F', borderRadius: 4,
                                    paddingHorizontal: 6, paddingVertical: 2,
                                  }}
                                >
                                  <Text style={{ fontSize: 8, fontWeight: '700', color: '#D32F2F', textTransform: 'uppercase' }}>
                                    Desmarcar
                                  </Text>
                                </TouchableOpacity>
                              </View>
                              {/* Contador X/Y */}
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#2196F3' }}>
                                {getUpdateCounter(concepto)}
                              </Text>
                            </View>
                          )}
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#191c1e', lineHeight: 15 }} numberOfLines={2}>
                            {concepto.descripcion}
                          </Text>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#003d9b', marginTop: 2 }}>
                            ${concepto.costo_unitario.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </Text>
                        </View>

                        {/* Celdas interactivas */}
                        {Array.from({ length: colCount }, (_, colIdx) => {
                          const { bg, text, blocked } = getCellVisual(concepto, colIdx);

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
                              activeOpacity={blocked ? 1 : 0.7}
                            >
                              <View style={{
                                width: CELL_W - 8,
                                aspectRatio: 1,
                                borderRadius: 4,
                                backgroundColor: bg,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                {text !== null && (
                                  <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
                                    {text}
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
        // 2d: Modo Actualización — botón único "Guardar Actualización"
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
    </SafeAreaView>
  );
}
