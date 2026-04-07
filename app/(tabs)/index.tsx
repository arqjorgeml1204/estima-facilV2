/**
 * (tabs)/index.tsx
 * Pantalla principal: Lista de Proyectos.
 * En primera visita muestra el modal de carga de contrato PDF.
 */

import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { initDatabase, getProyectos } from '../../db/database';
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
}

export default function ProyectosScreen() {
  const [proyectos, setProyectos]  = useState<Proyecto[]>([]);
  const [loading, setLoading]      = useState(true);
  const [showModal, setShowModal]  = useState(false);

  useEffect(() => {
    (async () => {
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
      const data = await getProyectos();
      setProyectos(data as Proyecto[]);
    } finally {
      setLoading(false);
    }
  };

  const handleContractLoaded = async (proyectoId: number) => {
    setShowModal(false);
    await loadProyectos();
    router.push(`/proyecto/${proyectoId}` as any);
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
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
              SEM. {item.semana_actual}
            </Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#191c1e', lineHeight: 18 }}>
            {item.nombre}
          </Text>
          <Text style={{ fontSize: 11, color: '#737685', marginTop: 2 }}>
            {item.numero_contrato}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color="#c3c6d6" />
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
      </View>
    </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
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

      <ContractUploadModal
        visible={showModal}
        onComplete={handleContractLoaded}
        onSkip={() => setShowModal(false)}
      />
    </SafeAreaView>
  );
}
