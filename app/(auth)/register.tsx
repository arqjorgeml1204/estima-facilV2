/**
 * register.tsx
 * Pantalla de Registro — EstimaFácil
 * Design System: Blueprint Precision
 */

import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateTrial } from '../../utils/subscription';

// TODO: Integrar con auth real cuando se implemente backend
const STORAGE_KEY_LOGGED  = '@estimafacil:logged';
const STORAGE_KEY_SESSION = 'user_session';
const STORAGE_KEY_USERID  = '@estimafacil:user_id';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const [nombre, setNombre]               = useState('');
  const [email, setEmail]                 = useState('');
  const [phone, setPhone]                 = useState('');
  const [usePhone, setUsePhone]           = useState(false);
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');

  // ── Validación y registro ──────────────────────────────────────────────────
  const handleRegister = async () => {
    setError('');

    if (!nombre.trim()) {
      setError('Ingresa tu nombre completo.');
      return;
    }
    if (usePhone) {
      const digits = phone.trim().replace(/[^0-9]/g, '');
      if (digits.length < 10) {
        setError('Telefono invalido. Minimo 10 digitos.');
        return;
      }
    } else {
      if (!EMAIL_REGEX.test(email.trim())) {
        setError('Correo electronico invalido.');
        return;
      }
    }
    if (password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const userId = usePhone
        ? `tel:${phone.trim().replace(/[^0-9]/g, '')}`
        : email.trim().toLowerCase();

      // TODO: reemplazar con registro real en backend
      await AsyncStorage.setItem(
        STORAGE_KEY_SESSION,
        JSON.stringify({ nombre: nombre.trim(), email: usePhone ? '' : email.trim(), phone: usePhone ? phone.trim() : '' }),
      );
      await AsyncStorage.setItem(STORAGE_KEY_LOGGED, 'true');
      await AsyncStorage.setItem(STORAGE_KEY_USERID, userId);
      await activateTrial();
      router.replace('/(tabs)');
    } catch (e) {
      setError('Error al crear la cuenta. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
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
        {/* Logo / Marca */}
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
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
          <Text style={{
            fontSize: 22, fontWeight: '800', color: '#191c1e',
            fontFamily: 'Manrope', letterSpacing: -0.5,
          }}>
            Crear cuenta
          </Text>
          <Text style={{
            fontSize: 13, color: '#737685', marginTop: 4,
            fontFamily: 'Inter', fontWeight: '500',
          }}>
            EstimaFácil · Registro gratuito
          </Text>
        </View>

        {/* Campos */}
        <View style={{ gap: 14 }}>

          {/* Nombre completo */}
          <View>
            <Text style={labelStyle}>Nombre completo</Text>
            <TextInput
              value={nombre}
              onChangeText={setNombre}
              placeholder="Juan Pérez"
              placeholderTextColor="#c3c6d6"
              keyboardType="default"
              autoCapitalize="words"
              style={inputStyle}
            />
          </View>

          {/* Toggle Correo / Telefono */}
          <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1.5, borderColor: '#003d9b' }}>
            <TouchableOpacity
              onPress={() => setUsePhone(false)}
              style={{
                flex: 1, paddingVertical: 10, alignItems: 'center',
                backgroundColor: !usePhone ? '#003d9b' : 'transparent',
              }}
              activeOpacity={0.8}
            >
              <Text style={{
                fontSize: 13, fontWeight: '700',
                color: !usePhone ? '#ffffff' : '#003d9b',
                fontFamily: 'Inter',
              }}>
                Email
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setUsePhone(true)}
              style={{
                flex: 1, paddingVertical: 10, alignItems: 'center',
                backgroundColor: usePhone ? '#003d9b' : 'transparent',
              }}
              activeOpacity={0.8}
            >
              <Text style={{
                fontSize: 13, fontWeight: '700',
                color: usePhone ? '#ffffff' : '#003d9b',
                fontFamily: 'Inter',
              }}>
                Telefono
              </Text>
            </TouchableOpacity>
          </View>

          {/* Correo electronico o Telefono */}
          {usePhone ? (
            <View>
              <Text style={labelStyle}>Telefono</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="5512345678"
                placeholderTextColor="#c3c6d6"
                keyboardType="phone-pad"
                autoCapitalize="none"
                style={inputStyle}
              />
            </View>
          ) : (
            <View>
              <Text style={labelStyle}>Correo electronico</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="correo@empresa.com"
                placeholderTextColor="#c3c6d6"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                style={inputStyle}
              />
            </View>
          )}

          {/* Contraseña */}
          <View>
            <Text style={labelStyle}>Contraseña</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor="#c3c6d6"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                style={[inputStyle, { paddingRight: 48 }]}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={eyeButtonStyle}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 18, color: '#737685' }}>
                  {showPassword ? '🙈' : '👁'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirmar contraseña */}
          <View>
            <Text style={labelStyle}>Confirmar contraseña</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repite tu contraseña"
                placeholderTextColor="#c3c6d6"
                secureTextEntry={!showConfirm}
                autoComplete="new-password"
                style={[inputStyle, { paddingRight: 48 }]}
              />
              <TouchableOpacity
                onPress={() => setShowConfirm(!showConfirm)}
                style={eyeButtonStyle}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 18, color: '#737685' }}>
                  {showConfirm ? '🙈' : '👁'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Error */}
          {error ? (
            <View style={{
              backgroundColor: '#ffdad6', borderRadius: 8,
              paddingHorizontal: 12, paddingVertical: 10,
            }}>
              <Text style={{ fontSize: 12, color: '#93000a', fontFamily: 'Inter', fontWeight: '600' }}>
                {error}
              </Text>
            </View>
          ) : null}

          {/* Botón CREAR CUENTA */}
          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading}
            style={{
              marginTop: 4,
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
              <Text style={{
                color: '#ffffff', fontSize: 15, fontWeight: '700',
                fontFamily: 'Inter', letterSpacing: 1,
              }}>
                CREAR CUENTA
              </Text>
            )}
          </TouchableOpacity>

          {/* Texto legal */}
          <Text style={{
            textAlign: 'center', fontSize: 11, color: '#737685',
            fontFamily: 'Inter', lineHeight: 16, marginTop: 4,
          }}>
            Al registrarte aceptas los Términos y Condiciones
          </Text>

          {/* Volver al login */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ alignItems: 'center', paddingVertical: 8 }}
            activeOpacity={0.7}
          >
            <Text style={{
              fontSize: 13, color: '#003d9b', fontFamily: 'Inter',
              fontWeight: '600',
            }}>
              ¿Ya tienes cuenta? Inicia sesión
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Estilos compartidos ────────────────────────────────────────────────────
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
