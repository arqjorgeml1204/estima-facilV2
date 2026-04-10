/**
 * suscripcion.tsx
 * Pantalla de suscripcion y canje de codigos.
 * Accesible desde Ajustes via router.push('/suscripcion').
 *
 * Flujo de pago:
 * 1. Usuario toca plan (Mensual/Anual)
 * 2. Modal: Transferencia / Efectivo / Cancelar
 * 3. Modal con datos de pago segun metodo
 * 4. "Ya realice el pago" -> genera token, inserta en Supabase, envia email+WA
 * 5. Muestra token en pantalla con boton copiar
 */

import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
  Modal, Linking, Share,
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
import { generateToken } from '../utils/tokenGenerator';

// ── Supabase config ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://zolfaqrvgirdnwqypxwd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvbGZhcXJ2Z2lyZG53cXlweHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Njk0MDAsImV4cCI6MjA5MTM0NTQwMH0.UOYB-dHAGJa8ZlP-NZhT6wgLvb-Cv9Yo82TWhO0W3R8';

// ── EmailJS config (PENDING) ─────────────────────────────────────────────────
const EMAILJS_SERVICE_ID = 'PENDING_CONFIG';
const EMAILJS_TEMPLATE_ID = 'PENDING_CONFIG';
const EMAILJS_PUBLIC_KEY = 'PENDING_CONFIG';

// ── Types ────────────────────────────────────────────────────────────────────
type SubStatus = 'active' | 'expired' | 'none';
type ModalStep = 'none' | 'method' | 'transfer' | 'cash' | 'success';
type PlanType = 'monthly' | 'annual';

// ── Plan config ──────────────────────────────────────────────────────────────
const PLANS = {
  monthly: { name: 'Mensual', price: '$2,499 MXN', days: 30 },
  annual:  { name: 'Anual',   price: '$24,999 MXN', days: 365 },
} as const;

// ── EmailJS helper ───────────────────────────────────────────────────────────
const sendEmail = async (toEmail: string, planName: string, token: string) => {
  try {
    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: toEmail,
          plan_name: planName,
          activation_code: token,
          message: `Tu plan ${planName} de EstimaFacil ha sido activado.\n\nCodigo de activacion: ${token}\n\nCanjealo en la app: Ajustes > Suscripcion > Canjear codigo.`,
        },
      }),
    });
  } catch (e) {
    console.log('Email no enviado:', e);
  }
};

export default function SuscripcionScreen() {
  const router = useRouter();

  // ── Subscription state ──────────────────────────────────────────────────
  const [status, setStatus]           = useState<SubStatus>('none');
  const [daysLeft, setDaysLeft]       = useState(0);
  const [subType, setSubType]         = useState<string | null>(null);
  const [expiryDate, setExpiryDate]   = useState<string | null>(null);
  const [code, setCode]               = useState('');
  const [redeeming, setRedeeming]     = useState(false);

  // ── Payment modal state ─────────────────────────────────────────────────
  const [modalStep, setModalStep]       = useState<ModalStep>('none');
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('monthly');
  const [processing, setProcessing]     = useState(false);
  const [generatedToken, setGeneratedToken] = useState('');
  const [copied, setCopied]             = useState(false);

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

  // ── Redeem existing code ────────────────────────────────────────────────
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

  // ── Payment flow ────────────────────────────────────────────────────────
  const openPaymentModal = (plan: PlanType) => {
    setSelectedPlan(plan);
    setModalStep('method');
  };

  const handlePaymentConfirmed = async () => {
    setProcessing(true);
    try {
      const token = generateToken();
      const plan = PLANS[selectedPlan];
      const userId = await getCurrentUserId();

      // 1. Insert token in Supabase
      await fetch(`${SUPABASE_URL}/rest/v1/activation_codes`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          code: token,
          type: selectedPlan,
          days: plan.days,
          is_used: false,
        }),
      });

      // 2. Send email if user is email-based
      if (userId.includes('@')) {
        await sendEmail(userId, plan.name, token);
      }
      // Always send to admin
      await sendEmail('arq.jorgeml@gmail.com', plan.name, token);

      // 3. Open WhatsApp to admin
      const adminMsg = encodeURIComponent(
        `EstimaFacil - Nuevo pago confirmado\nPlan: ${plan.name}\nUsuario: ${userId}\nToken generado: ${token}`
      );
      Linking.openURL(`https://wa.me/522284104931?text=${adminMsg}`).catch(() => {});

      // 4. If user has phone, also WA to user
      if (userId.startsWith('tel:')) {
        const phone = userId.replace('tel:', '');
        const userMsg = encodeURIComponent(
          `Tu codigo EstimaFacil ${plan.name} es: ${token}\nCanjealo en la app en Ajustes > Suscripcion.`
        );
        Linking.openURL(`https://wa.me/52${phone}?text=${userMsg}`).catch(() => {});
      }

      // 5. Show token on screen
      setGeneratedToken(token);
      setModalStep('success');
    } catch (err) {
      console.log('Error en flujo de pago:', err);
      Alert.alert('Error', 'Hubo un problema al registrar el pago. Intenta de nuevo.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyToken = async () => {
    try {
      await Share.share({ message: generatedToken });
    } catch {
      // Fallback silencioso
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeAllModals = () => {
    setModalStep('none');
    setGeneratedToken('');
    setCopied(false);
  };

  // ── Status helpers ──────────────────────────────────────────────────────
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
  const currentPlan = PLANS[selectedPlan];

  // ── Render ──────────────────────────────────────────────────────────────
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
            placeholder="Ej: EF8X2K4M"
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
          <TouchableOpacity
            onPress={() => openPaymentModal('monthly')}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
            }}
          >
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#003d9b' }}>$2,499 MXN</Text>
              <MaterialIcons name="chevron-right" size={20} color="#c3c6d6" />
            </View>
          </TouchableOpacity>

          {/* Plan Anual */}
          <TouchableOpacity
            onPress={() => openPaymentModal('annual')}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 14,
            }}
          >
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#004f11' }}>$24,999 MXN</Text>
              <MaterialIcons name="chevron-right" size={20} color="#c3c6d6" />
            </View>
          </TouchableOpacity>

          {/* Instrucciones */}
          <View style={{
            backgroundColor: '#f8f9fb', borderRadius: 8,
            padding: 14, marginTop: 16,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <MaterialIcons name="info-outline" size={16} color="#003d9b" style={{ marginTop: 2 }} />
              <Text style={{ fontSize: 12, color: '#434654', lineHeight: 18, flex: 1 }}>
                Toca un plan para ver las opciones de pago. Recibiras tu codigo de activacion al confirmar.
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Metodo de pago
          ═══════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={modalStep === 'method'}
        transparent
        animationType="fade"
        onRequestClose={closeAllModals}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center', alignItems: 'center', padding: 24,
        }}>
          <View style={{
            backgroundColor: '#ffffff', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 360,
          }}>
            <Text style={{
              fontSize: 18, fontWeight: '800', color: '#191c1e',
              textAlign: 'center', marginBottom: 4,
            }}>
              Plan {currentPlan.name}
            </Text>
            <Text style={{
              fontSize: 14, color: '#737685', textAlign: 'center', marginBottom: 24,
            }}>
              {currentPlan.price}
            </Text>

            <Text style={{
              fontSize: 15, fontWeight: '700', color: '#191c1e',
              textAlign: 'center', marginBottom: 20,
            }}>
              Como quieres pagar?
            </Text>

            {/* Transferencia */}
            <TouchableOpacity
              onPress={() => setModalStep('transfer')}
              activeOpacity={0.8}
              style={{
                backgroundColor: '#003d9b', borderRadius: 10, paddingVertical: 14,
                alignItems: 'center', flexDirection: 'row',
                justifyContent: 'center', gap: 8, marginBottom: 10,
              }}
            >
              <MaterialIcons name="account-balance" size={18} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
                Transferencia bancaria
              </Text>
            </TouchableOpacity>

            {/* Efectivo */}
            <TouchableOpacity
              onPress={() => setModalStep('cash')}
              activeOpacity={0.8}
              style={{
                backgroundColor: '#004f11', borderRadius: 10, paddingVertical: 14,
                alignItems: 'center', flexDirection: 'row',
                justifyContent: 'center', gap: 8, marginBottom: 10,
              }}
            >
              <MaterialIcons name="storefront" size={18} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
                Efectivo (OXXO, Soriana, etc.)
              </Text>
            </TouchableOpacity>

            {/* Cancelar */}
            <TouchableOpacity
              onPress={closeAllModals}
              activeOpacity={0.8}
              style={{
                borderRadius: 10, paddingVertical: 14,
                alignItems: 'center', borderWidth: 1, borderColor: '#e1e2e4',
              }}
            >
              <Text style={{ color: '#737685', fontSize: 14, fontWeight: '600' }}>
                Cancelar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Transferencia bancaria
          ═══════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={modalStep === 'transfer'}
        transparent
        animationType="fade"
        onRequestClose={closeAllModals}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center', alignItems: 'center', padding: 24,
        }}>
          <View style={{
            backgroundColor: '#ffffff', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 360,
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              marginBottom: 20, justifyContent: 'center',
            }}>
              <MaterialIcons name="account-balance" size={22} color="#003d9b" />
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#191c1e' }}>
                Transferencia bancaria
              </Text>
            </View>

            {/* Datos bancarios */}
            <View style={{
              backgroundColor: '#f8f9fb', borderRadius: 10, padding: 16, marginBottom: 16,
            }}>
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Beneficiario
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#191c1e' }}>
                  Jorge Osvaldo Martinez Lopez
                </Text>
              </View>
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  CLABE
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#003d9b', letterSpacing: 1 }}>
                  638180010156185070
                </Text>
              </View>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#737685', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Entidad financiera
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#191c1e' }}>
                  Nu Mexico
                </Text>
              </View>
            </View>

            <View style={{
              backgroundColor: '#e8edf7', borderRadius: 8, padding: 12, marginBottom: 20,
            }}>
              <Text style={{ fontSize: 12, color: '#434654', lineHeight: 18, textAlign: 'center' }}>
                Recibiras tu codigo de activacion de EstimaFacil via WhatsApp o correo electronico.
              </Text>
            </View>

            {/* Acciones */}
            <TouchableOpacity
              onPress={handlePaymentConfirmed}
              disabled={processing}
              activeOpacity={0.85}
              style={{
                backgroundColor: processing ? '#c3c6d6' : '#003d9b',
                borderRadius: 10, paddingVertical: 14,
                alignItems: 'center', flexDirection: 'row',
                justifyContent: 'center', gap: 8, marginBottom: 10,
              }}
            >
              {processing ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={18} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
                    Ya realice el pago
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={closeAllModals}
              activeOpacity={0.8}
              style={{
                borderRadius: 10, paddingVertical: 14,
                alignItems: 'center', borderWidth: 1, borderColor: '#e1e2e4',
              }}
            >
              <Text style={{ color: '#737685', fontSize: 14, fontWeight: '600' }}>
                En otro momento
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Pago en efectivo
          ═══════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={modalStep === 'cash'}
        transparent
        animationType="fade"
        onRequestClose={closeAllModals}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center', alignItems: 'center', padding: 24,
        }}>
          <View style={{
            backgroundColor: '#ffffff', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 360,
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              marginBottom: 20, justifyContent: 'center',
            }}>
              <MaterialIcons name="storefront" size={22} color="#004f11" />
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#191c1e' }}>
                Pago en efectivo
              </Text>
            </View>

            {/* Codigo */}
            <View style={{
              backgroundColor: '#f8f9fb', borderRadius: 10, padding: 16, marginBottom: 16,
              alignItems: 'center',
            }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', color: '#737685',
                textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
              }}>
                Codigo para efectivo
              </Text>
              <Text style={{
                fontSize: 20, fontWeight: '800', color: '#004f11',
                letterSpacing: 2,
              }}>
                5101 2561 6755 7942
              </Text>
            </View>

            {/* Instrucciones */}
            <View style={{
              backgroundColor: '#e7f7ea', borderRadius: 10, padding: 14, marginBottom: 16,
            }}>
              <Text style={{
                fontSize: 13, fontWeight: '700', color: '#004f11', marginBottom: 10,
              }}>
                Como funciona?
              </Text>
              <Text style={{ fontSize: 12, color: '#434654', lineHeight: 20, marginBottom: 4 }}>
                1. Ve a OXXO, Soriana, Kiosko, Chedraui, Farmacias del Ahorro, Waldo's u otras tiendas de conveniencia.
              </Text>
              <Text style={{ fontSize: 12, color: '#434654', lineHeight: 20, marginBottom: 4 }}>
                2. Dale al cajero el codigo y el monto del deposito.
              </Text>
              <Text style={{ fontSize: 12, color: '#434654', lineHeight: 20 }}>
                3. Si no encuentran Nu en el sistema, puedes decir que quieres depositar con PESpay.
              </Text>
            </View>

            <View style={{
              backgroundColor: '#e8edf7', borderRadius: 8, padding: 12, marginBottom: 20,
            }}>
              <Text style={{ fontSize: 12, color: '#434654', lineHeight: 18, textAlign: 'center' }}>
                Recibiras tu codigo de activacion de EstimaFacil via WhatsApp o correo electronico.
              </Text>
            </View>

            {/* Acciones */}
            <TouchableOpacity
              onPress={handlePaymentConfirmed}
              disabled={processing}
              activeOpacity={0.85}
              style={{
                backgroundColor: processing ? '#c3c6d6' : '#004f11',
                borderRadius: 10, paddingVertical: 14,
                alignItems: 'center', flexDirection: 'row',
                justifyContent: 'center', gap: 8, marginBottom: 10,
              }}
            >
              {processing ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={18} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
                    Ya realice el pago
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={closeAllModals}
              activeOpacity={0.8}
              style={{
                borderRadius: 10, paddingVertical: 14,
                alignItems: 'center', borderWidth: 1, borderColor: '#e1e2e4',
              }}
            >
              <Text style={{ color: '#737685', fontSize: 14, fontWeight: '600' }}>
                En otro momento
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Token generado (exito)
          ═══════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={modalStep === 'success'}
        transparent
        animationType="fade"
        onRequestClose={closeAllModals}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center', alignItems: 'center', padding: 24,
        }}>
          <View style={{
            backgroundColor: '#ffffff', borderRadius: 16, padding: 28,
            width: '100%', maxWidth: 360, alignItems: 'center',
          }}>
            {/* Icono check */}
            <View style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: '#e7f7ea', justifyContent: 'center',
              alignItems: 'center', marginBottom: 16,
            }}>
              <MaterialIcons name="check-circle" size={32} color="#004f11" />
            </View>

            <Text style={{
              fontSize: 20, fontWeight: '800', color: '#191c1e',
              marginBottom: 8, textAlign: 'center',
            }}>
              Pago registrado!
            </Text>

            <Text style={{
              fontSize: 14, color: '#737685', marginBottom: 20, textAlign: 'center',
            }}>
              Tu codigo de activacion:
            </Text>

            {/* Token display */}
            <View style={{
              backgroundColor: '#f8f9fb', borderRadius: 12, padding: 16,
              width: '100%', alignItems: 'center', marginBottom: 12,
              borderWidth: 2, borderColor: '#003d9b', borderStyle: 'dashed',
            }}>
              <Text style={{
                fontSize: 28, fontWeight: '800', color: '#003d9b',
                letterSpacing: 3,
              }}>
                {generatedToken}
              </Text>
            </View>

            {/* Copiar */}
            <TouchableOpacity
              onPress={handleCopyToken}
              activeOpacity={0.8}
              style={{
                backgroundColor: copied ? '#e7f7ea' : '#e8edf7',
                borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20,
                flexDirection: 'row', alignItems: 'center', gap: 6,
                marginBottom: 20,
              }}
            >
              <MaterialIcons
                name={copied ? 'check' : 'content-copy'}
                size={16}
                color={copied ? '#004f11' : '#003d9b'}
              />
              <Text style={{
                fontSize: 13, fontWeight: '700',
                color: copied ? '#004f11' : '#003d9b',
              }}>
                {copied ? 'Compartido!' : 'Copiar codigo'}
              </Text>
            </TouchableOpacity>

            <Text style={{
              fontSize: 13, color: '#434654', lineHeight: 20,
              textAlign: 'center', marginBottom: 24,
            }}>
              Ingresa el codigo arriba en "Canjear codigo" para activar tu suscripcion.
            </Text>

            {/* Cerrar */}
            <TouchableOpacity
              onPress={closeAllModals}
              activeOpacity={0.85}
              style={{
                backgroundColor: '#003d9b', borderRadius: 10, paddingVertical: 14,
                width: '100%', alignItems: 'center',
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
                Cerrar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
