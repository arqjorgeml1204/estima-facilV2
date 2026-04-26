/**
 * (tabs)/index.tsx
 * Pantalla principal: Lista de Proyectos.
 * En primera visita muestra el modal de carga de contrato PDF.
 */

import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Modal, TextInput,
  ScrollView, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { initDatabase, getProyectos, deleteProyecto, updateProyectoAlias, getTotalEstimadoPorProyecto, setProyectoObra } from '../../db/database';
import { getCurrentUserId } from '../../utils/auth';
import { hasActiveSubscription, syncSubscriptionFromCloud } from '../../utils/subscription';
import { getProyectoDisplayWeek } from '../../utils/weekUtils';
import { getObras, getObraColorById, getObraColorFallback, Obra } from '../../utils/obras';
import ContractUploadModal from '../../components/ContractUploadModal';
import BlockScreen from '../../components/BlockScreen';

const STORAGE_KEY_FIRST_TIME = '@estimafacil:firstTime';

interface Proyecto {
  id: number;
  codigo: string;
  numero_contrato: string;
  nombre: string;
  monto_contrato: number;
  semana_actual: number;
  numero_estimacion_actual: number;
  alias?: string;
  monto_restante?: number;
  display_week?: number;
  obra_id?: string | null;
}

// Tipo de filtro de obra: 'todas' (todos los proyectos), 'sin' (sin obra), o id de obra concreta.
type FiltroObra = 'todas' | 'sin' | string;

export default function ProyectosScreen() {
  const [proyectos, setProyectos]  = useState<Proyecto[]>([]);
  const [loading, setLoading]      = useState(true);
  const [showModal, setShowModal]  = useState(false);
  const [editingId, setEditingId]  = useState<number | null>(null);
  const [editAlias, setEditAlias]  = useState('');
  const [blocked, setBlocked]      = useState<boolean | null>(null);
  // Map id -> Obra para pintar badges en las cards. Re-carga con cada focus.
  const [obrasMap, setObrasMap]    = useState<Record<string, Obra>>({});
  // Lista cruda de obras (en orden) para el filtro y el picker de reasignacion.
  const [obrasList, setObrasList]  = useState<Obra[]>([]);
  // Filtro de obra activo en la lista. 'todas' por default.
  const [filtroObraId, setFiltroObraId] = useState<FiltroObra>('todas');
  // Picker de reasignacion: cuando es != null, abre Modal para cambiar obra del proyecto.
  const [reassignProyecto, setReassignProyecto] = useState<Proyecto | null>(null);

  useEffect(() => {
    (async () => {
      const logged = await AsyncStorage.getItem('@estimafacil:logged');
      if (logged !== 'true') {
        router.replace('/(auth)/login');
        return;
      }

      await initDatabase();
      const firstTime = await AsyncStorage.getItem(STORAGE_KEY_FIRST_TIME);
      if (!firstTime) {
        setShowModal(true);
        await AsyncStorage.setItem(STORAGE_KEY_FIRST_TIME, 'done');
      }
      await evaluateSubscriptionGate(true);
      await loadProyectos();
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        // Al volver a la tab: re-evaluar suscripción y re-cargar proyectos.
        // Pasamos isFirstMount=false para preservar el estado previo si la red falla.
        await evaluateSubscriptionGate(false);
        await loadProyectos();
      })();
    }, [])
  );

  // Sync con Supabase + re-lee local.
  // - 1er mount (isFirstMount=true): fail-open — si hay timeout/offline, dejar pasar.
  // - Foco posterior (isFirstMount=false): re-checar local; preservar bloqueo si la red falla,
  //   para evitar que el usuario "escape" del BlockScreen simplemente navegando entre tabs.
  const evaluateSubscriptionGate = async (isFirstMount: boolean) => {
    try {
      const userId = await getCurrentUserId();
      const sync = await syncSubscriptionFromCloud(userId, 5000);
      if (sync.timedOut || sync.offline) {
        // Sin respuesta del servidor: decidir con el estado local actual.
        if (isFirstMount) {
          // Fail-open en arranque para no bloquear al usuario offline en el primer ingreso.
          setBlocked(false);
        } else {
          // En focus posterior: bloquear si local dice que no hay plan activo.
          // Esto impide que el usuario "escape" del BlockScreen navegando entre tabs.
          const localActive = await hasActiveSubscription(userId);
          setBlocked(!localActive);
        }
        return;
      }
      const active = await hasActiveSubscription(userId);
      setBlocked(!active);
    } catch {
      // Error inesperado: en 1er mount fail-open; en focus posterior preservar bloqueo previo.
      if (isFirstMount) setBlocked(false);
    }
  };

  const loadProyectos = async () => {
    setLoading(true);
    try {
      const userId = await getCurrentUserId();
      const data = await getProyectos(userId);

      // Cargar obras en paralelo para pintar badges en las cards.
      const obras = await getObras();
      const map: Record<string, Obra> = {};
      for (const o of obras) map[o.id] = o;
      setObrasMap(map);
      setObrasList(obras);

      const proyectosConRestante = await Promise.all(
        (data as Proyecto[]).map(async (p) => {
          const totalEstimado = await getTotalEstimadoPorProyecto(p.id);
          const displayWeek = await getProyectoDisplayWeek(p.id);
          return {
            ...p,
            monto_restante: Math.max(0, p.monto_contrato - totalEstimado),
            display_week: displayWeek,
          };
        })
      );
      setProyectos(proyectosConRestante);
    } finally {
      setLoading(false);
    }
  };

  const handleContractLoaded = async (proyectoId: number) => {
    setShowModal(false);
    await loadProyectos();
    router.push(`/proyecto/${proyectoId}` as any);
  };

  const handleDelete = (proyecto: Proyecto) => {
    // Diferimos el Alert un tick para evitar race con el press del card padre:
    // si el outer TouchableOpacity fuera también a disparar router.push, ya
    // habremos perdido foco antes de que el Alert reciba la respuesta. Con
    // setTimeout(0) aseguramos que cualquier navegación en cola se procese
    // primero (y nuestro responder bloquea esa nav, ver wrapper de acciones).
    setTimeout(() => {
      Alert.alert(
        'Borrar proyecto',
        `¿Borrar proyecto ${proyecto.nombre}? Esta acción no se puede deshacer.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Borrar', style: 'destructive',
            onPress: async () => {
              try {
                await deleteProyecto(proyecto.id);
                await loadProyectos();
              } catch (e: any) {
                console.error('[ProyectosScreen] deleteProyecto error:', e?.message ?? e);
                Alert.alert('Error', `No se pudo borrar el proyecto (${e?.message ?? 'error desconocido'}).`);
              }
            },
          },
        ],
      );
    }, 0);
  };

  // Reasigna obra al proyecto seleccionado en el picker. obraId === null => "Sin obra".
  const handleReassignObra = async (obraId: string | null) => {
    if (!reassignProyecto) return;
    const target = reassignProyecto;
    setReassignProyecto(null);
    try {
      await setProyectoObra(target.id, obraId);
      await loadProyectos();
    } catch (e: any) {
      console.error('[ProyectosScreen] setProyectoObra error:', e?.message ?? e);
      Alert.alert('Error', `No se pudo reasignar la obra (${e?.message ?? 'error desconocido'}).`);
    }
  };

  const handleSaveAlias = async () => {
    if (editingId != null) {
      await updateProyectoAlias(editingId, editAlias.trim());
      setEditingId(null);
      setEditAlias('');
      await loadProyectos();
    }
  };

  const renderProyecto = ({ item }: { item: Proyecto }) => {
    const aditivaSuffix = item.numero_contrato?.match(/_([A-Z]\d+)$/)?.[1];
    // Badge obra: si obra_id existe en el map -> badge con color + nombre de obra.
    // Si obra_id es null (legacy) -> "Sin obra" gris.
    // Si obra_id apunta a obra eliminada -> "Obra eliminada" gris.
    const obraDelProyecto = item.obra_id ? obrasMap[item.obra_id] : null;
    let obraBadgeLabel: string;
    let obraBadgeColor: string;
    if (!item.obra_id) {
      obraBadgeLabel = 'Sin obra';
      obraBadgeColor = getObraColorFallback();
    } else if (!obraDelProyecto) {
      obraBadgeLabel = 'Obra eliminada';
      obraBadgeColor = getObraColorFallback();
    } else {
      obraBadgeLabel = obraDelProyecto.nombre;
      obraBadgeColor = getObraColorById(item.obra_id);
    }
    return (
    <TouchableOpacity
      onPress={() => router.push(`/proyecto/${item.id}` as any)}
      activeOpacity={0.85}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 12, padding: 16,
        marginHorizontal: 16, marginBottom: 10,
        shadowColor: '#191c1e',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Badge de OBRA arriba de todo, resaltado con color por obra. Tappable
          para reasignar obra al proyecto. onStartShouldSetResponder evita
          que el card padre navegue al detalle cuando el usuario toca el badge. */}
      <View
        style={{ flexDirection: 'row', marginBottom: 8 }}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setReassignProyecto(item)}
          style={{
            backgroundColor: obraBadgeColor, borderRadius: 6,
            paddingHorizontal: 10, paddingVertical: 4,
            maxWidth: '100%',
            flexDirection: 'row', alignItems: 'center', gap: 4,
          }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text
            numberOfLines={1}
            style={{ color: '#ffffff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}
          >
            {obraBadgeLabel}
          </Text>
          <MaterialIcons name="edit" size={11} color="#ffffff" />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <View style={{ backgroundColor: '#003d9b', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>
                {item.codigo}
              </Text>
            </View>
            {aditivaSuffix ? (
              <View style={{ backgroundColor: '#FFB74D', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#000000', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>
                  ADITIVA {aditivaSuffix}
                </Text>
              </View>
            ) : null}
            <Text style={{ fontSize: 10, color: '#737685', fontWeight: '600' }}>
              ESTIM #{item.numero_estimacion_actual} | SEM. #{item.display_week ?? item.semana_actual}
            </Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#191c1e', lineHeight: 18 }}>
            {item.nombre}
          </Text>
          {item.alias ? (
            <Text style={{ fontSize: 11, color: '#003d9b', fontWeight: '600', marginTop: 2 }}>
              {item.alias}
            </Text>
          ) : null}
          <Text style={{ fontSize: 11, color: '#737685', marginTop: 2 }}>
            {item.numero_contrato}
          </Text>
        </View>
        {/* Wrapper que captura el responder para los iconos de accion. En RN
            Android, e.stopPropagation no impide que el TouchableOpacity padre
            (la card) tambien dispare onPress -> el router.push navegaba al
            detalle ANTES de que el Alert recibiera respuesta, por eso el
            "borrar" parecia no hacer nada. Con onStartShouldSetResponder en
            true, esta View se queda con el touch y el padre nunca dispara. */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
        >
          <TouchableOpacity
            onPress={() => { setEditAlias(item.alias || ''); setEditingId(item.id); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="edit" size={18} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="delete" size={18} color="#F44336" />
          </TouchableOpacity>
          <MaterialIcons name="chevron-right" size={20} color="#c3c6d6" />
        </View>
      </View>

      <View style={{
        flexDirection: 'row', marginTop: 12, paddingTop: 12,
        borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 16,
      }}>
        <View>
          <Text style={{ fontSize: 9, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Monto Contrato
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#003d9b', marginTop: 2 }}>
            ${item.monto_contrato.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: 9, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Estimación
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#191c1e', marginTop: 2 }}>
            #{item.numero_estimacion_actual}
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: 9, color: '#737685', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Monto Restante
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: item.monto_restante === 0 ? '#004f11' : '#93000a', marginTop: 2 }}>
            ${(item.monto_restante ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
    );
  };

  // Aplica filtro de obra a la lista renderizada. 'todas' = sin filtro,
  // 'sin' = obra_id null/empty, otro = match exacto contra item.obra_id.
  const proyectosFiltrados = useMemo(() => {
    if (filtroObraId === 'todas') return proyectos;
    if (filtroObraId === 'sin') return proyectos.filter(p => !p.obra_id);
    return proyectos.filter(p => p.obra_id === filtroObraId);
  }, [proyectos, filtroObraId]);

  // Etiqueta visible del filtro activo (para el chip resaltado).
  const filtroLabel = filtroObraId === 'todas'
    ? 'Todas'
    : filtroObraId === 'sin'
    ? 'Sin obra'
    : (obrasMap[filtroObraId]?.nombre ?? 'Obra eliminada');

  if (blocked === true) {
    return <BlockScreen />;
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#e1e2e4',
      }}>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#191c1e', letterSpacing: -0.5 }}>
            Proyectos
          </Text>
          <Text style={{ fontSize: 11, color: '#737685', marginTop: 1 }}>
            {proyectosFiltrados.length} de {proyectos.length} contrato{proyectos.length !== 1 ? 's' : ''} activo{proyectos.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowModal(true)}
          style={{
            backgroundColor: '#003d9b', borderRadius: 10,
            paddingHorizontal: 14, paddingVertical: 9,
            flexDirection: 'row', alignItems: 'center', gap: 6,
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={16} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {/* Filtro de obra: chips horizontales coloreados. Solo se muestra si
          el usuario tiene obras o proyectos cargados (caso vacio muestra el
          empty state mas abajo). */}
      {!loading && proyectos.length > 0 ? (
        <View style={{ borderBottomWidth: 1, borderBottomColor: '#eef0f2', backgroundColor: '#f8f9fb' }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}
          >
            {/* Chip "Todas" */}
            <TouchableOpacity
              onPress={() => setFiltroObraId('todas')}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                backgroundColor: filtroObraId === 'todas' ? '#003d9b' : '#ffffff',
                borderWidth: 1,
                borderColor: filtroObraId === 'todas' ? '#003d9b' : '#d4d6de',
              }}
            >
              <Text style={{
                fontSize: 11, fontWeight: '700', letterSpacing: 0.3,
                color: filtroObraId === 'todas' ? '#ffffff' : '#434654',
              }}>
                Todas
              </Text>
            </TouchableOpacity>
            {/* Chip "Sin obra" */}
            <TouchableOpacity
              onPress={() => setFiltroObraId('sin')}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                backgroundColor: filtroObraId === 'sin' ? getObraColorFallback() : '#ffffff',
                borderWidth: 1,
                borderColor: filtroObraId === 'sin' ? getObraColorFallback() : '#d4d6de',
              }}
            >
              <Text style={{
                fontSize: 11, fontWeight: '700', letterSpacing: 0.3,
                color: filtroObraId === 'sin' ? '#ffffff' : '#434654',
              }}>
                Sin obra
              </Text>
            </TouchableOpacity>
            {/* Chip por cada obra existente */}
            {obrasList.map((obra) => {
              const active = filtroObraId === obra.id;
              const color = getObraColorById(obra.id);
              return (
                <TouchableOpacity
                  key={obra.id}
                  onPress={() => setFiltroObraId(obra.id)}
                  activeOpacity={0.8}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                    backgroundColor: active ? color : '#ffffff',
                    borderWidth: 1,
                    borderColor: active ? color : '#d4d6de',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 11, fontWeight: '700', letterSpacing: 0.3,
                      color: active ? '#ffffff' : '#434654',
                      maxWidth: 140,
                    }}
                  >
                    {obra.nombre}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#003d9b" />
        </View>
      ) : proyectos.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <MaterialIcons name="folder-open" size={64} color="#c3c6d6" />
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#191c1e', marginTop: 16, textAlign: 'center' }}>
            Sin proyectos
          </Text>
          <Text style={{ fontSize: 13, color: '#737685', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            Carga tu primer contrato PDF{'\n'}para comenzar
          </Text>
          <TouchableOpacity
            onPress={() => setShowModal(true)}
            style={{
              marginTop: 24, backgroundColor: '#003d9b',
              borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12,
            }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700' }}>Cargar contrato</Text>
          </TouchableOpacity>
        </View>
      ) : proyectosFiltrados.length === 0 ? (
        // Empty state cuando el filtro deja la lista vacia (hay proyectos pero
        // ninguno coincide con la obra seleccionada).
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <MaterialIcons name="filter-alt" size={56} color="#c3c6d6" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#191c1e', marginTop: 14, textAlign: 'center' }}>
            Sin proyectos en "{filtroLabel}"
          </Text>
          <Text style={{ fontSize: 12, color: '#737685', marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
            Cambia el filtro de obra para ver{'\n'}otros contratos.
          </Text>
          <TouchableOpacity
            onPress={() => setFiltroObraId('todas')}
            style={{
              marginTop: 18, backgroundColor: '#003d9b',
              borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9,
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>Mostrar todas</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={proyectosFiltrados}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderProyecto}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal editar alias */}
      <Modal visible={editingId != null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#191c1e', marginBottom: 12 }}>
              Editar alias
            </Text>
            <TextInput
              value={editAlias}
              onChangeText={setEditAlias}
              placeholder="aditiva de ..."
              placeholderTextColor="#c3c6d6"
              style={{
                backgroundColor: '#e7e8ea', borderRadius: 8,
                paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 14, color: '#191c1e',
                borderBottomWidth: 2, borderBottomColor: '#003d9b',
                marginBottom: 16,
              }}
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity onPress={() => { setEditingId(null); setEditAlias(''); }}>
                <Text style={{ fontSize: 14, color: '#737685', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveAlias}>
                <Text style={{ fontSize: 14, color: '#003d9b', fontWeight: '700' }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ContractUploadModal
        visible={showModal}
        onComplete={handleContractLoaded}
        onSkip={() => setShowModal(false)}
      />

      {/* Modal: reasignar obra al proyecto seleccionado.
          - "Sin obra" -> setProyectoObra(id, null) -> badge gris.
          - Cualquier obra existente -> setProyectoObra(id, obra.id).
          No incluye "Crear nueva obra" porque el flujo vive en Ajustes;
          mantenemos este picker enfocado solo en reasignar. */}
      <Modal
        visible={reassignProyecto != null}
        transparent
        animationType="fade"
        onRequestClose={() => setReassignProyecto(null)}
      >
        <Pressable
          onPress={() => setReassignProyecto(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => { /* swallow press to evitar cerrar al tocar el panel */ }}
            style={{
              backgroundColor: '#ffffff',
              borderTopLeftRadius: 16, borderTopRightRadius: 16,
              paddingTop: 14, paddingBottom: 24, maxHeight: '70%',
            }}
          >
            <View style={{ alignItems: 'center', paddingBottom: 8 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#d4d6de' }} />
            </View>
            <Text style={{
              fontSize: 15, fontWeight: '800', color: '#191c1e',
              paddingHorizontal: 20, paddingBottom: 12,
            }}>
              Reasignar obra
            </Text>
            {reassignProyecto ? (
              <Text style={{
                fontSize: 11, color: '#737685', paddingHorizontal: 20, marginTop: -8, marginBottom: 12,
              }}>
                {reassignProyecto.nombre}
              </Text>
            ) : null}
            <FlatList
              data={obrasList}
              keyExtractor={(o) => o.id}
              ListHeaderComponent={
                <TouchableOpacity
                  onPress={() => handleReassignObra(null)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 12, gap: 12,
                  }}
                >
                  <View style={{
                    width: 14, height: 14, borderRadius: 7,
                    backgroundColor: getObraColorFallback(),
                  }} />
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#434654' }}>
                    Sin obra
                  </Text>
                  {reassignProyecto && !reassignProyecto.obra_id ? (
                    <MaterialIcons name="check" size={18} color="#003d9b" />
                  ) : null}
                </TouchableOpacity>
              }
              renderItem={({ item: obra }) => {
                const selected = reassignProyecto?.obra_id === obra.id;
                return (
                  <TouchableOpacity
                    onPress={() => handleReassignObra(obra.id)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 20, paddingVertical: 12, gap: 12,
                    }}
                  >
                    <View style={{
                      width: 14, height: 14, borderRadius: 7,
                      backgroundColor: getObraColorById(obra.id),
                    }} />
                    <Text
                      numberOfLines={1}
                      style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#191c1e' }}
                    >
                      {obra.nombre}
                    </Text>
                    {selected ? (
                      <MaterialIcons name="check" size={18} color="#003d9b" />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: '#f3f4f6', marginLeft: 46 }} />
              )}
              ListEmptyComponent={
                <Text style={{
                  paddingHorizontal: 20, paddingVertical: 20,
                  fontSize: 12, color: '#737685', textAlign: 'center',
                }}>
                  No hay obras creadas. Crea una en Ajustes.
                </Text>
              }
            />
            <TouchableOpacity
              onPress={() => setReassignProyecto(null)}
              style={{
                marginTop: 8, marginHorizontal: 20,
                paddingVertical: 10, borderRadius: 10,
                backgroundColor: '#eef0f2', alignItems: 'center',
              }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#434654' }}>
                Cancelar
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
