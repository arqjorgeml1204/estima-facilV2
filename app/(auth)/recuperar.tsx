/**
 * recuperar.tsx
 * Pantalla "Olvidaste tu contraseña" — EstimaFácil.
 *
 * Flujo (todo local, sin email):
 *   1. Pide email.
 *   2. Verifica que exista la cuenta (SQLite local + fallback Supabase).
 *   3. Pide nueva contraseña + confirmación.
 *   4. Guarda hash nuevo (mismo método que registro: SHA-256 + salt aleatorio).
 *   5. Auto-login → /(tabs).
 *
 * Diseño consistente con login.tsx / register.tsx (Blueprint Precision).
 */

import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { findUserByEmail, resetPasswordByEmail, isValidEmail } from '../../utils/auth';

const STORAGE_KEY_LOGGED = '@estimafacil:logged';
const STORAGE_KEY_USERID = '@estimafacil:user_id';

type Step = 'email' | 'password' | 'success';

export default function RecuperarScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Paso 1: validar email registrado ──────────────────────────────────────
  const handleEmailSubmit = async () => {
    const input = email.trim().toLowerCase();
    setError('');
    if (!input) {
      setError('Ingresa tu correo electrónico.');
      return;
    }
    if (!isValidEmail(input)) {
      setError('Correo electrónico inválido.');
      return;
    }
    setLoading(true);
    try {
      const usuario = await findUserByEmail(input);
      if (!usuario) {
        setError('No hay cuenta registrada con ese correo.');
        setLoading(false);
        return;
      }
      setStep('password');
    } catch (e: any) {
      setError(`Error al verificar el correo (${e?.message ?? 'desconocido'}). Intenta de nuevo.`);
    } finally {
      setLoading(false);
    }
  };

  // ── Paso 2: nueva contraseña ──────────────────────────────────────────────
  const handlePasswordSubmit = async () => {
    setError('');
    if (!newPassword || !confirmPassword) {
      setError('Ingresa la contraseña y su confirmación.');
      return;
    }
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const result = await resetPasswordByEmail(email.trim().toLowerCase(), newPassword);
      if (!result.ok) {
        setError(result.error ?? 'No se pudo actualizar la contraseña.');
        setLoading(false);
        return;
      }
      // Auto-login: marcar sesión y entrar a la app.
      await AsyncStorage.setItem(STORAGE_KEY_LOGGED, 'true');
      await AsyncStorage.setItem(STORAGE_KEY_USERID, email.trim().toLowerCase());
      setStep('success');
      setTimeout(() => router.replace('/(tabs)' as any), 1200);
    } catch (e: any) {
      setError(`Error al guardar la contraseña (${e?.message ?? 'desconocido'}).`);
    } finally {
      setLoading(false);
    }
  };

  // ── Estilos compartidos (consistentes con login.tsx) ──────────────────────
  const labelStyle = {
    fontSize: 11, fontWeight: '700' as const, color: '#434654',
    textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 6,
    fontFamily: 'Inter',
  };
  const inputStyle = {
    backgroundColor: '#e7e8ea',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#191c1e',
    fontFamily: 'Inter',
    borderBottomWidth: 2,
    borderBottomColor: '#003d9b',
  };
  const eyeButtonStyle = {
    position: 'absolute' as const,
    right: 12, top: 0, bottom: 0,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f9fb', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <View style={{
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: '#1dc77d',
          justifyContent: 'center', alignItems: 'center',
          marginBottom: 16,
        }}>
          <Text style={{ fontSize: 36, color: '#ffffff', fontWeight: '800' }}>✓</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#191c1e', fontFamily: 'Manrope' }}>
          Contraseña actualizada
        </Text>
        <Text style={{ fontSize: 13, color: '#737685', marginTop: 8, textAlign: 'center', fontFamily: 'Inter' }}>
          Iniciando sesión…
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: '#f8f9fb' }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 36 }}>
          <View style={{
            width: 64, height: 64, borderRadius: 16,
            backgroundColor: '#003d9b',
            justifyContent: 'center', alignItems: 'center',
            marginBottom: 16,
            shadowColor: '#003d9b',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 16,
            elevation: 8,
          }}>
            <Text style={{ fontSize: 28, color: '#ffffff', fontWeight: '800' }}>E</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#191c1e', fontFamily: 'Manrope', letterSpacing: -0.5 }}>
            {step === 'email' ? 'Recuperar contraseña' : 'Nueva contraseña'}
          </Text>
          <Text style={{ fontSize: 13, color: '#737685', marginTop: 4, fontFamily: 'Inter', fontWeight: '500', textAlign: 'center' }}>
            {step === 'email'
              ? 'Ingresa el correo asociado a tu cuenta'
              : 'Crea una nueva contraseña segura'}
          </Text>
        </View>

        {step === 'email' ? (
          <View style={{ gap: 14 }}>
            <View>
              <Text style={labelStyle}>Correo electrónico</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="correo@empresa.com"
                placeholderTextColor="#c3c6d6"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!loading}
                style={inputStyle}
              />
            </View>

            {error ? (
              <View style={{ backgroundColor: '#ffdad6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ fontSize: 12, color: '#93000a', fontFamily: 'Inter', fontWeight: '600' }}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleEmailSubmit}
              disabled={loading}
              style={{
                marginTop: 8,
                backgroundColor: loading ? '#c3c6d6' : '#003d9b',
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
                shadowColor: '#003d9b',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: loading ? 0 : 0.3,
                shadowRadius: 12,
                elevation: loading ? 0 : 6,
              }}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700', fontFamily: 'Inter', letterSpacing: 1 }}>
                  SIGUIENTE
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.back()}
              style={{ alignItems: 'center', paddingVertical: 8 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 13, color: '#003d9b', fontFamily: 'Inter', fontWeight: '600' }}>
                Volver al login
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <View>
              <Text style={labelStyle}>Nueva contraseña</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Mínimo 8 caracteres"
                  placeholderTextColor="#c3c6d6"
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  editable={!loading}
                  style={[inputStyle, { paddingRight: 48 }]}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={eyeButtonStyle}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 18, color: '#737685' }}>{showPassword ? '🙈' : '👁'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View>
              <Text style={labelStyle}>Confirmar contraseña</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Repite la contraseña"
                  placeholderTextColor="#c3c6d6"
                  secureTextEntry={!showConfirm}
                  autoComplete="new-password"
                  editable={!loading}
                  style={[inputStyle, { paddingRight: 48 }]}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirm(!showConfirm)}
                  style={eyeButtonStyle}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 18, color: '#737685' }}>{showConfirm ? '🙈' : '👁'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {error ? (
              <View style={{ backgroundColor: '#ffdad6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ fontSize: 12, color: '#93000a', fontFamily: 'Inter', fontWeight: '600' }}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handlePasswordSubmit}
              disabled={loading}
              style={{
                marginTop: 8,
                backgroundColor: loading ? '#c3c6d6' : '#003d9b',
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
                shadowColor: '#003d9b',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: loading ? 0 : 0.3,
                shadowRadius: 12,
                elevation: loading ? 0 : 6,
              }}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700', fontFamily: 'Inter', letterSpacing: 1 }}>
                  CAMBIAR CONTRASEÑA
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setStep('email'); setError(''); setNewPassword(''); setConfirmPassword(''); }}
              style={{ alignItems: 'center', paddingVertical: 8 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 13, color: '#003d9b', fontFamily: 'Inter', fontWeight: '600' }}>
                Volver
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
