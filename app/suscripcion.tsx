/**
 * suscripcion.tsx
 * Pantalla de suscripcion y canje de codigos.
 * Accesible desde Ajustes via router.push('/suscripcion').
 */

import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  hasActiveSubscription,
  getDaysRemaining,
  getSubscriptionType,
  getSubscriptionExpiry,
  redeemCode,
} from '../utils/subscription';
import { getCurrentUserId } from '../utils/auth';

type SubStatus = 'active' | 'expired' | 'none';

export default function SuscripcionScreen() {
  const router = useRouter();

  const [status, setStatus]           = useState<SubStatus>('none');
  const [daysLeft, setDaysLeft]       = useState(0);
  const [subType, setSubType]         = useState<string | null>(null);
  const [expiryDate, setExpiryDate]   = useState<string | null>(null);
  const [code, setCode]               = useState('');
  const [redeeming, setRedeeming]     = useState(false);

  useEffect(() => {
    loadSubscriptionStatus();
  }, []);

  const loadSubscriptionStatus = async () => {
    const active  = await hasActiveSubscription();
    const days    = await getDaysRemaining();
    const type    = await getSubscriptionType();
    const expires = await getSubscriptionExpiry();

    if (!expires) {
      setStatus('none');
    } else if (active) {
      setStatus('active');
    } else {
      setStatus('expired');
    }

    setDaysLeft(days);
    setSubType(type);
    setExpiryDate(expires);
  };

  const formatDate = (iso: string | null): string => {
    if (!iso) return '--';
    const d = new Date(iso);
    const day   = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year  = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Ingresa un codigo de activacion.');
      return;
    }

    setRedeeming(true);
    try {
      const userId = await getCurrentUserId();
      const result = await redeemCode(trimmed, userId);
      Alert.alert(
        'Codigo canjeado',
        `Tu suscripcion ${result.type} se ha activado por ${result.days} dias.`,
      );
      setCode('');
      await loadSubscriptionStatus();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo canjear el codigo.');
    } finally {
      setRedeeming(false);
    }
  };

  const statusLabel = () => {
    switch (status) {
      case 'active':
        return { text: `ACTIVA hasta ${formatDate(expiryDate)}`, color: '#004f11', bg: '#e7f7ea' };
      case 'expired':
        return { text: 'VENCIDA', color: '#93000a', bg: '#ffdad6' };
      default:
        return { text: 'Sin suscripcion', color: '#737685', bg: '#e7e8ea' };
    }
  };

  const typeLabel = () => {
    if (!subType) return null;
    const map: Record<string, string> = {
      trial: 'PRUEBA',
      monthly: 'MENSUAL',
      annual: 'ANUAL',
      pro: 'PRO',
    };
    return map[subType] || subType.toUpperCase();
  };

  const sl = statusLabel();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#e1e2e4',
        gap: 12,
      }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={24} color="#191c1e" />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#191c1e', letterSpacing: -0.5 }}>
          Suscripcion
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>

        {/* Estado actual */}
        <View style={{
          backgroundColor: '#ffffff', borderRadius: 12, padding: 20, marginBottom: 20,
          shadowColor: '#191c1e', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
        }}>
          <Text style={{
            fontSize: 11, fontWeight: '700', color: '#434654',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
          }}>
            Estado actual
          </Text>

          <View style={{
            flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 12,
          }}>
            <View style={{
              backgroundColor: sl.bg, borderRadius: 8,
              paddingHorizontal: 12, paddingVertical: 6,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: sl.color }}>
                {sl.text}
              </Text>
            </View>
            {subType ? (
              <View style={{
                backgroundColor: '#003d9b', borderRadius: 6,
                paddingHorizontal: 10, paddingVertical: 4,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 }}>
                  {typeLabel()}
                </Text>
              </View>
            ) : null}
          </View>

          {status !== 'none' ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: '#f8f9fb', borderRadius: 8,
              paddingHorizontal: 12, paddingVertical: 10,
            }}>
              <MaterialIcons
                name="schedule"
                size={18}
                color={status === 'active' ? '#003d9b' : '#93000a'}
              />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#191c1e' }}>
                {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'} restantes
              </Text>
            </View>
          ) : null}
        </View>

        {/* Canjear codigo */}
        <View style={{
          backgroundColor: '#ffffff', borderRadius: 12, padding: 20, marginBottom: 20,
          shadowColor: '#191c1e', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <MaterialIcons name="vpn-key" size={20} color="#003d9b" />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#191c1e' }}>
              Canjear codigo
            </Text>
          </View>

          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Ej: ESTIMA-2025-XXXX"
            placeholderTextColor="#c3c6d6"
            autoCapitalize="characters"
            style={{
              backgroundColor: '#e7e8ea', borderRadius: 8,
              paddingHorizontal: 14, paddingVertical: 14,
              fontSize: 15, color: '#191c1e', fontWeight: '600',
              letterSpacing: 1,
              borderBottomWidth: 2, borderBottomColor: '#003d9b',
              marginBottom: 16,
            }}
          />

          <TouchableOpacity
            onPress={handleRedeem}
            disabled={redeeming}
            style={{
              backgroundColor: redeeming ? '#c3c6d6' : '#003d9b',
              borderRadius: 10, paddingVertical: 14,
              alignItems: 'center', flexDirection: 'row',
              justifyContent: 'center', gap: 8,
            }}
            activeOpacity={0.85}
          >
            {redeeming ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <MaterialIcons name="redeem" size={18} color="#ffffff" />
                <Text style={{
                  color: '#ffffff', fontSize: 14, fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  Canjear codigo
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Planes disponibles */}
        <View style={{
          backgroundColor: '#ffffff', borderRadius: 12, padding: 20, marginBottom: 20,
          shadowColor: '#191c1e', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
        }}>
          <Text style={{
            fontSize: 11, fontWeight: '700', color: '#003d9b',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
          }}>
            Planes disponibles
          </Text>

          {/* Plan Mensual */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: '#e8edf7', justifyContent: 'center', alignItems: 'center',
              }}>
                <MaterialIcons name="calendar-month" size={18} color="#003d9b" />
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#191c1e' }}>Mensual</Text>
                <Text style={{ fontSize: 11, color: '#737685' }}>30 dias de acceso</Text>
              </View>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#003d9b' }}>$299 MXN</Text>
          </View>

          {/* Plan Anual */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 14,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: '#e7f7ea', justifyContent: 'center', alignItems: 'center',
              }}>
                <MaterialIcons name="star" size={18} color="#004f11" />
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#191c1e' }}>Anual</Text>
                <Text style={{ fontSize: 11, color: '#737685' }}>365 dias de acceso</Text>
              </View>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#004f11' }}>$1,999 MXN</Text>
          </View>

          {/* Instrucciones de pago */}
          <View style={{
            backgroundColor: '#f8f9fb', borderRadius: 8,
            padding: 14, marginTop: 16,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <MaterialIcons name="info-outline" size={16} color="#003d9b" style={{ marginTop: 2 }} />
              <Text style={{ fontSize: 12, color: '#434654', lineHeight: 18, flex: 1 }}>
                Realiza tu pago y recibiras tu codigo de activacion por WhatsApp.
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
