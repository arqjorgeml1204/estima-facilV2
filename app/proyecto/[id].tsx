/**
 * proyecto/[id].tsx
 * Dashboard del proyecto: stats + historial de estimaciones.
 */

import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import {
  getProyectoById,
  getEstimacionesByProyecto,
  crearEstimacion,
  deleteEstimacion,
  deleteProyecto,
  incrementarContadoresProyecto,
} from '../../db/database';

interface Proyecto {
  id: number;
  codigo: string;
  numero_contrato: string;
  nombre: string;
  descripcion_contrato: string;
  monto_contrato: number;
  total_unidades: number;
  prototipo: string;
  fecha_inicio: string;
  fecha_terminacion: string;
  semana_actual: number;
  numero_estimacion_actual: number;
  frente: string;
  alias: string;
}

interface Estimacion {
  id: number;
  numero: number;
  semana: number;
  periodo_desde: string;
  periodo_hasta: string;
  fecha: string;
  subtotal: number;
  total_a_pagar: number;
  status: string;
}

export default function ProyectoDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [proyecto, setProyecto]       = useState<Proyecto | null>(null);
  const [estimaciones, setEstimaciones] = useState<Estimacion[]>([]);
  const [loading, setLoading]         = useState(true);

  const load = async () => {
    setLoading(true);
    const p = await getProyectoById(Number(id));
    const e = await getEstimacionesByProyecto(Number(id));
    setProyecto(p as Proyecto);
    setEstimaciones(e as Estimacion[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [id]));

  const handleNuevaEstimacion = async () => {
    if (!proyecto) return;
    const numero = proyecto.numero_estimacion_actual;
    const semana = proyecto.semana_actual;
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - hoy.getDay() + 1);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);

    const fmt = (d: Date) =>
      `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;

    const estId = await crearEstimacion(
      proyecto.id, numero, semana, fmt(lunes), fmt(domingo)
    );
    // Actualizar contadores del proyecto para que semana_actual y
    // numero_estimacion_actual reflejen la estimacion recién creada
    await incrementarContadoresProyecto(proyecto.id, numero, semana);
    router.push(`/estimacion/${estId}` as any);
  };

  const handleVerEstimacion = (estId: number) => {
    router.push({ pathname: '/estimacion/[id]', params: { id: estId, mode: 'view' } } as any);
  };

  const handleEditarEstimacion = (estId: number) => {
    router.push(`/estimacion/${estId}` as any);
  };

  const handleBorrarEstimacion = (estId: number, numero: number) => {
    Alert.alert(
      '¿Eliminar estimacion?',
      `¿Eliminar Estimacion #${numero}? Esta accion no puede deshacerse.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            await deleteEstimacion(estId);
            load();
          },
        },
      ]
    );
  };

  const handleOpenEstimacion = (estId: number) => {
    router.push(`/estimacion/${estId}` as any);
  };

  const handleEliminarContrato = () => {
    if (!proyecto) return;
    Alert.alert(
      '¿Eliminar este contrato?',
      'Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            await deleteProyecto(proyecto.id);
            router.replace('/' as any);
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f9fb', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#003d9b" />
      </View>
    );
  }

  if (!proyecto) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f9fb', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#737685' }}>Proyecto no encontrado</Text>
      </View>
    );
  }

  const estimadoAcumulado = estimaciones.reduce((s, e) => s + (e.subtotal || 0), 0);
  const porcentaje = proyecto.monto_contrato > 0
    ? Math.round((estimadoAcumulado / proyecto.monto_contrato) * 100)
    : 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
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
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#191c1e', letterSpacing: -0.3 }}>
            {proyecto.codigo}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 10, color: '#737685', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {proyecto.alias
                ? `${proyecto.alias} — Contrato #${proyecto.numero_contrato}`
                : `Contrato #${proyecto.numero_contrato}`}
            </Text>
            {proyecto.numero_contrato?.match(/_([A-Z]\d+)$/)?.[1] ? (
              <View style={{ backgroundColor: '#FFB74D', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ color: '#000000', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 }}>
                  ADITIVA {proyecto.numero_contrato.match(/_([A-Z]\d+)$/)?.[1]}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <TouchableOpacity onPress={handleEliminarContrato} activeOpacity={0.7}>
          <MaterialIcons name="delete" size={22} color="#D32F2F" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Stats Card */}
        <View style={{
          margin: 16, backgroundColor: '#003d9b', borderRadius: 16,
          padding: 20, shadowColor: '#003d9b',
          shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
        }}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
            Monto de Contrato
          </Text>
          <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: '800', marginTop: 4, letterSpacing: -1 }}>
            ${proyecto.monto_contrato.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
          </Text>

          <View style={{ flexDirection: 'row', marginTop: 16, gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                Estimado
              </Text>
              <Text style={{ color: '#a3f69c', fontSize: 16, fontWeight: '800', marginTop: 2 }}>
                ${estimadoAcumulado.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                Restante
              </Text>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '800', marginTop: 2 }}>
                ${(proyecto.monto_contrato - estimadoAcumulado).toLocaleString('es-MX', { minimumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                Avance
              </Text>
              <Text style={{ color: '#a3f69c', fontSize: 16, fontWeight: '800', marginTop: 2 }}>
                {porcentaje}%
              </Text>
            </View>
          </View>

          {/* Barra de progreso */}
          <View style={{ marginTop: 12, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4, height: 6 }}>
            <View style={{
              width: `${Math.min(porcentaje, 100)}%`,
              backgroundColor: '#a3f69c', borderRadius: 4, height: 6,
            }} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
              Semana {proyecto.semana_actual} · {proyecto.total_unidades} unidades
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
              {proyecto.prototipo}
            </Text>
          </View>
        </View>

        {/* Notas */}
        {proyecto.descripcion_contrato ? (
          <View style={{
            marginHorizontal: 16, marginBottom: 16,
            backgroundColor: '#ffffff', borderRadius: 12, padding: 14,
          }}>
            <Text style={{ fontSize: 9, color: '#003d9b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Descripción del Contrato
            </Text>
            <Text style={{ fontSize: 11, color: '#434654', lineHeight: 18 }}>
              {proyecto.descripcion_contrato}
            </Text>
          </View>
        ) : null}

        {/* Estimaciones */}
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#191c1e' }}>
              Estimaciones
            </Text>
            <TouchableOpacity
              onPress={handleNuevaEstimacion}
              style={{
                backgroundColor: '#003d9b', borderRadius: 8,
                paddingHorizontal: 12, paddingVertical: 7,
                flexDirection: 'row', alignItems: 'center', gap: 5,
              }}
              activeOpacity={0.85}
            >
              <MaterialIcons name="add" size={14} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>Nueva</Text>
            </TouchableOpacity>
          </View>

          {estimaciones.length === 0 ? (
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 12, padding: 24,
              alignItems: 'center',
            }}>
              <MaterialIcons name="calculate" size={40} color="#c3c6d6" />
              <Text style={{ color: '#737685', fontSize: 13, marginTop: 12, fontWeight: '600' }}>
                Sin estimaciones aún
              </Text>
              <TouchableOpacity
                onPress={handleNuevaEstimacion}
                style={{ marginTop: 12, backgroundColor: '#003d9b', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}
              >
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Crear primera estimación</Text>
              </TouchableOpacity>
            </View>
          ) : (
            estimaciones.map((est) => (
              <View
                key={est.id}
                style={{
                  backgroundColor: '#ffffff', borderRadius: 12,
                  padding: 14, marginBottom: 8,
                }}
              >
                {/* Info row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#191c1e' }}>
                        Est. #{est.numero}
                      </Text>
                      <View style={{
                        backgroundColor: est.status === 'finalizada' ? '#a3f69c' : '#e7e8ea',
                        borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1,
                      }}>
                        <Text style={{
                          fontSize: 9, fontWeight: '700',
                          color: est.status === 'finalizada' ? '#004f11' : '#737685',
                          textTransform: 'uppercase', letterSpacing: 0.5,
                        }}>
                          {est.status === 'finalizada' ? 'Finalizada' : 'Borrador'}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: '#737685' }}>
                      Sem. {est.semana} · {est.periodo_desde} – {est.periodo_hasta}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#003d9b' }}>
                    ${(est.total_a_pagar || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                  </Text>
                </View>
                {/* Action buttons VER / EDITAR / BORRAR */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => handleVerEstimacion(est.id)}
                    style={{
                      flex: 1, paddingVertical: 7, borderRadius: 6,
                      borderWidth: 1.5, borderColor: '#c3c6d6',
                      alignItems: 'center',
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Ver
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleEditarEstimacion(est.id)}
                    style={{
                      flex: 1, paddingVertical: 7, borderRadius: 6,
                      backgroundColor: '#003d9b',
                      alignItems: 'center',
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#ffffff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Editar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleBorrarEstimacion(est.id, est.numero)}
                    style={{
                      flex: 1, paddingVertical: 7, borderRadius: 6,
                      borderWidth: 1.5, borderColor: '#D32F2F',
                      alignItems: 'center',
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#D32F2F', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Borrar
                    </Text>
                  </TouchableOpacity>
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
