/**
 * (tabs)/index.tsx
 * Pantalla principal: Lista de Proyectos.
 * En primera visita muestra el modal de carga de contrato PDF.
 */

import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { initDatabase, getProyectos, deleteProyecto, updateProyectoAlias, getTotalEstimadoPorProyecto } from '../../db/database';
import { getCurrentUserId } from '../../utils/auth';
import { hasActiveSubscription } from '../../utils/subscription';
import ContractUploadModal from '../../components/ContractUploadModal';

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
}

export default function ProyectosScreen() {
  const [proyectos, setProyectos]  = useState<Proyecto[]>([]);
  const [loading, setLoading]      = useState(true);
  const [showModal, setShowModal]  = useState(false);
  const [editingId, setEditingId]  = useState<number | null>(null);
  const [editAlias, setEditAlias]  = useState('');

  useEffect(() => {
    (async () => {
      // Verificar sesion activa antes de mostrar la lista
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
      await loadProyectos();
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProyectos();
    }, [])
  );

  const loadProyectos = async () => {
    setLoading(true);
    try {
      const userId = await getCurrentUserId();
      const data = await getProyectos(userId);

      // Calcular monto_restante para cada proyecto
      const proyectosConRestante = await Promise.all(
        (data as Proyecto[]).map(async (p) => {
          const totalEstimado = await getTotalEstimadoPorProyecto(p.id);
          return { ...p, monto_restante: Math.max(0, p.monto_contrato - totalEstimado) };
        })
      );
      setProyectos(proyectosConRestante);

      // Verificar suscripcion (no bloquear — solo informar)
      const active = await hasActiveSubscription(userId);
      if (!active) {
        Alert.alert(
          'Suscripcion requerida',
          'Tu periodo de prueba ha vencido. Activa tu suscripcion para continuar usando EstimaFacil.',
          [
            { text: 'Activar ahora', onPress: () => router.push('/suscripcion') },
            { text: 'Cerrar', style: 'cancel' },
          ],
        );
      }
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
    Alert.alert(
      'Borrar proyecto',
      `¿Borrar proyecto ${proyecto.nombre}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar', style: 'destructive',
          onPress: async () => {
            await deleteProyecto(proyecto.id);
            await loadProyectos();
          },
        },
      ],
    );
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
              ESTIM #{item.numero_estimacion_actual} | SEM. #{item.semana_actual}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); setEditAlias(item.alias || ''); setEditingId(item.id); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="edit" size={18} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); handleDelete(item); }}
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
            {proyectos.length} contrato{proyectos.length !== 1 ? 's' : ''} activo{proyectos.length !== 1 ? 's' : ''}
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
      ) : (
        <FlatList
          data={proyectos}
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
    </SafeAreaView>
  );
}
