/**
 * login.tsx
 * Pantalla de Login — EstimaFácil
 * Design System: Blueprint Precision
 */

import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPassword } from '../../utils/auth';
import { getUsuarioByUserId, initDatabase, getDb } from '../../db/database';

const STORAGE_KEY_EMAIL    = '@estimafacil:email';
const STORAGE_KEY_REMEMBER = '@estimafacil:remember';
const STORAGE_KEY_LOGGED   = '@estimafacil:logged';
const STORAGE_KEY_USERID   = '@estimafacil:user_id';

export default function LoginScreen() {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  // ── Auto-login si hay sesión guardada ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        const remembered = await AsyncStorage.getItem(STORAGE_KEY_REMEMBER);
        if (remembered === 'true') {
          const savedEmail = await AsyncStorage.getItem(STORAGE_KEY_EMAIL);
          if (savedEmail) setEmailOrPhone(savedEmail);
          const logged = await AsyncStorage.getItem(STORAGE_KEY_LOGGED);
          if (logged === 'true') {
            router.replace('/(tabs)');
            return;
          }
        }
      } catch (e) {
        console.error('Session check error:', e);
      } finally {
        setCheckingSession(false);
      }
    })();
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const input = emailOrPhone.trim();
    if (!input || !password.trim()) {
      setError('Ingresa tu correo/telefono y contrasena.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // Detectar si es email o telefono
      const isEmail = input.indexOf('@') >= 0;
      if (isEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(input)) {
          setError('Correo electronico invalido.');
          setLoading(false);
          return;
        }
      } else {
        // Telefono: solo digitos, minimo 10
        const digits = input.replace(/[^0-9]/g, '');
        if (digits.length < 10) {
          setError('Telefono invalido. Minimo 10 digitos.');
          setLoading(false);
          return;
        }
      }

      if (password.length < 6) {
        setError('La contrasena debe tener al menos 6 caracteres.');
        setLoading(false);
        return;
      }

      // Generar user_id segun tipo
      const userId = isEmail
        ? input.toLowerCase()
        : `tel:${input.replace(/[^0-9]/g, '')}`;

      // VERIFICACIÓN REAL DE CREDENCIALES
      await initDatabase();
      // Debug: verificar tabla usuarios
      try {
        const db = getDb();
        const tableCheck = await db.getFirstAsync<{count:number}>(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='usuarios'"
        );
        console.log('[AUTH] tabla usuarios existe:', tableCheck?.count);
        const userCount = await db.getFirstAsync<{count:number}>("SELECT COUNT(*) as count FROM usuarios");
        console.log('[AUTH] total usuarios registrados:', userCount?.count);
      } catch (e) {
        console.log('[AUTH] error verificando tabla:', e);
      }
      const usuario = await getUsuarioByUserId(userId);
      if (!usuario) {
        setError('No existe cuenta con este correo/teléfono. Regístrate primero.');
        setLoading(false);
        return;
      }

      const inputHash = await hashPassword(password, usuario.salt);
      if (inputHash !== usuario.password_hash) {
        setError('Contraseña incorrecta. Inténtalo de nuevo.');
        setLoading(false);
        return;
      }

      // Login válido — guardar sesión
      if (remember) {
        await AsyncStorage.setItem(STORAGE_KEY_EMAIL, input);
        await AsyncStorage.setItem(STORAGE_KEY_REMEMBER, 'true');
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY_EMAIL);
        await AsyncStorage.setItem(STORAGE_KEY_REMEMBER, 'false');
      }
      await AsyncStorage.setItem(STORAGE_KEY_LOGGED, 'true');
      await AsyncStorage.setItem(STORAGE_KEY_USERID, userId);
      router.replace('/(tabs)');
    } catch (e) {
      setError('Error al iniciar sesion. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // ── Loading inicial ────────────────────────────────────────────────────────
  if (checkingSession) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f9fb', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#003d9b" />
      </View>
    );
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: '#f8f9fb' }}
    >
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 40 }}>

        {/* Logo / Marca */}
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
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
            fontSize: 28, fontWeight: '800', color: '#191c1e',
            fontFamily: 'Manrope', letterSpacing: -0.5,
          }}>
            {`EstimaF\u00e1cil\u00AE`}
          </Text>
          <Text style={{
            fontSize: 13, color: '#737685', marginTop: 4,
            fontFamily: 'Inter', fontWeight: '500',
          }}>
            Control de estimaciones de obra
          </Text>
        </View>

        {/* Campos */}
        <View style={{ gap: 12 }}>
          {/* Email o Telefono */}
          <View>
            <Text style={{
              fontSize: 11, fontWeight: '700', color: '#434654',
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
              fontFamily: 'Inter',
            }}>
              Correo o telefono
            </Text>
            <TextInput
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              placeholder="correo@empresa.com o 5512345678"
              placeholderTextColor="#c3c6d6"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={{
                backgroundColor: '#e7e8ea',
                borderRadius: 8,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontSize: 15,
                color: '#191c1e',
                fontFamily: 'Inter',
                borderBottomWidth: 2,
                borderBottomColor: '#003d9b',
              }}
            />
          </View>

          {/* Contraseña */}
          <View>
            <Text style={{
              fontSize: 11, fontWeight: '700', color: '#434654',
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
              fontFamily: 'Inter',
            }}>
              Contraseña
            </Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#c3c6d6"
                secureTextEntry={!showPassword}
                autoComplete="password"
                style={{
                  backgroundColor: '#e7e8ea',
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  paddingRight: 48,
                  paddingVertical: 14,
                  fontSize: 15,
                  color: '#191c1e',
                  fontFamily: 'Inter',
                  borderBottomWidth: 2,
                  borderBottomColor: '#003d9b',
                }}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 12, top: 0, bottom: 0,
                  justifyContent: 'center', paddingHorizontal: 4,
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 18, color: '#737685' }}>
                  {showPassword ? '🙈' : '👁'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Recordar usuario */}
          <TouchableOpacity
            onPress={() => setRemember(!remember)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}
            activeOpacity={0.7}
          >
            <View style={{
              width: 20, height: 20, borderRadius: 4,
              borderWidth: 2,
              borderColor: remember ? '#003d9b' : '#c3c6d6',
              backgroundColor: remember ? '#003d9b' : 'transparent',
              justifyContent: 'center', alignItems: 'center',
            }}>
              {remember && (
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>✓</Text>
              )}
            </View>
            <Text style={{ fontSize: 13, color: '#434654', fontFamily: 'Inter', fontWeight: '500' }}>
              Recordar usuario
            </Text>
          </TouchableOpacity>

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

          {/* Botón LOG IN */}
          <TouchableOpacity
            onPress={handleLogin}
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
              <Text style={{
                color: '#ffffff', fontSize: 15, fontWeight: '700',
                fontFamily: 'Inter', letterSpacing: 1,
              }}>
                LOG IN
              </Text>
            )}
          </TouchableOpacity>

          {/* ¿Olvidaste tu contraseña? */}
          <TouchableOpacity
            onPress={() => Alert.alert('Próximamente', 'Función próximamente disponible.')}
            style={{ alignItems: 'center', paddingVertical: 4 }}
            activeOpacity={0.7}
          >
            <Text style={{
              fontSize: 13, color: '#003d9b', fontFamily: 'Inter',
              fontWeight: '600', textDecorationLine: 'underline',
            }}>
              ¿Olvidaste tu contraseña?
            </Text>
          </TouchableOpacity>

          {/* Botón REGISTRARSE GRATIS */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/register')}
            style={{
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              borderWidth: 2,
              borderColor: '#003d9b',
              backgroundColor: 'transparent',
            }}
            activeOpacity={0.8}
          >
            <Text style={{
              color: '#003d9b', fontSize: 15, fontWeight: '700',
              fontFamily: 'Inter', letterSpacing: 1,
            }}>
              REGISTRARSE GRATIS
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={{
          textAlign: 'center', marginTop: 32,
          fontSize: 11, color: '#c3c6d6',
          fontFamily: 'Inter',
        }}>
          EstimaFácil v1.0 · Datos almacenados localmente
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
