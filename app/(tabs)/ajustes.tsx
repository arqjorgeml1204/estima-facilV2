/**
 * ajustes.tsx
 * Pantalla de configuracion rediseñada — Wave 3F/Cambio 4b
 * Secciones: MI EMPRESA / MI CUENTA / SUSCRIPCION
 */

import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { getCurrentUserId } from '../../utils/auth';

export default function AjustesScreen() {
  const router = useRouter();

  // useRef pattern — evita re-render que destruye el teclado
  const obraRef   = useRef<string>('VISTAS DEL NEVADO');
  const frenteRef = useRef<string>('FRENTE 01');

  const [initialObra,   setInitialObra]   = useState('VISTAS DEL NEVADO');
  const [initialFrente, setInitialFrente] = useState('FRENTE 01');

  const [userAccount, setUserAccount] = useState('');
  const [editingPassword, setEditingPassword] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass,     setShowNewPass]     = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    (async () => {
      const obra   = await AsyncStorage.getItem('obra');
      const frente = await AsyncStorage.getItem('frente');
      if (obra)   { setInitialObra(obra);     obraRef.current   = obra; }
      if (frente) { setInitialFrente(frente); frenteRef.current = frente; }
      const userId = await getCurrentUserId();
      setUserAccount(userId === 'default' ? 'Sin cuenta' : userId);
    })();
  }, []);

  const handleSave = async () => {
    if (editingPassword && newPassword !== confirmPassword) {
      Alert.alert('Error', 'La nueva contrasena y la confirmacion no coinciden.');
      return;
    }
    await AsyncStorage.setItem('obra',   obraRef.current   || 'VISTAS DEL NEVADO');
    await AsyncStorage.setItem('frente', frenteRef.current || 'FRENTE 01');
    if (editingPassword) {
      // TODO: AuthService.updatePassword(currentPassword, newPassword)
    }
    Alert.alert('Guardado', 'Cambios guardados correctamente');
  };

  const RefField = ({
    label, defaultValue, onChangeText, placeholder,
  }: {
    label: string; defaultValue: string;
    onChangeText: (v: string) => void; placeholder?: string;
  }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={{
        fontSize: 11, fontWeight: '700', color: '#434654',
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
      }}>
        {label}
      </Text>
      <TextInput
        key={label}
        defaultValue={defaultValue}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#c3c6d6"
        autoCapitalize="none"
        style={{
          backgroundColor: '#e7e8ea', borderRadius: 8,
          paddingHorizontal: 14, paddingVertical: 12,
          fontSize: 14, color: '#191c1e',
          borderBottomWidth: 2, borderBottomColor: '#003d9b',
        }}
      />
    </View>
  );

  const SectionTitle = ({ label }: { label: string }) => (
    <Text style={{
      fontSize: 11, fontWeight: '700', color: '#003d9b',
      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
    }}>
      {label}
    </Text>
  );

  const Card = ({ children }: { children: React.ReactNode }) => (
    <View style={{
      backgroundColor: '#ffffff', borderRadius: 12,
      padding: 16, marginBottom: 24,
      shadowColor: '#191c1e', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
    }}>
      {children}
    </View>
  );

  const PasswordField = ({
    label, value, onChangeText, show, onToggle,
  }: {
    label: string; value: string;
    onChangeText: (v: string) => void;
    show: boolean; onToggle: () => void;
  }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={{
        fontSize: 11, fontWeight: '700', color: '#434654',
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
      }}>
        {label}
      </Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#e7e8ea', borderRadius: 8,
        borderBottomWidth: 2, borderBottomColor: '#003d9b',
      }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          style={{
            flex: 1, paddingHorizontal: 14, paddingVertical: 12,
            fontSize: 14, color: '#191c1e',
          }}
        />
        <TouchableOpacity onPress={onToggle} style={{ paddingHorizontal: 12 }}>
          <MaterialIcons
            name={show ? 'visibility' : 'visibility-off'}
            size={20} color="#737685"
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <View style={{
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#e1e2e4',
      }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#191c1e', letterSpacing: -0.5 }}>
          Ajustes
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>

        {/* MI EMPRESA */}
        <SectionTitle label="Mi Empresa" />
        <Card>
          <RefField
            label="OBRA"
            defaultValue={initialObra}
            onChangeText={(v: string) => { obraRef.current = v; }}
            placeholder="VISTAS DEL NEVADO"
          />
          <RefField
            label="FRENTE"
            defaultValue={initialFrente}
            onChangeText={(v: string) => { frenteRef.current = v; }}
            placeholder="FRENTE 01"
          />
        </Card>

        {/* MI CUENTA */}
        <SectionTitle label="Mi Cuenta" />
        <Card>
          {/* Email read-only */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{
              fontSize: 11, fontWeight: '700', color: '#434654',
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
            }}>
              Cuenta Asociada
            </Text>
            <View style={{
              backgroundColor: '#f0f1f3', borderRadius: 8,
              paddingHorizontal: 14, paddingVertical: 12,
            }}>
              <Text style={{ fontSize: 14, color: '#737685' }}>
                {userAccount || 'Cargando...'}
              </Text>
            </View>
          </View>

          {!editingPassword ? (
            <TouchableOpacity
              onPress={() => setEditingPassword(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="lock-outline" size={18} color="#003d9b" />
              <Text style={{ fontSize: 14, color: '#003d9b', fontWeight: '600' }}>
                Cambiar contrasena
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <PasswordField
                label="Contrasena actual"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                show={showCurrentPass}
                onToggle={() => setShowCurrentPass(p => !p)}
              />
              <PasswordField
                label="Nueva contrasena"
                value={newPassword}
                onChangeText={setNewPassword}
                show={showNewPass}
                onToggle={() => setShowNewPass(p => !p)}
              />
              <PasswordField
                label="Confirmar nueva contrasena"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                show={showConfirmPass}
                onToggle={() => setShowConfirmPass(p => !p)}
              />
              <TouchableOpacity
                onPress={() => {
                  setEditingPassword(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                style={{ alignSelf: 'flex-end', paddingVertical: 4 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, color: '#737685' }}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Separador */}
          <View style={{ height: 1, backgroundColor: '#e1e2e4', marginTop: 12, marginBottom: 12 }} />

          {/* Cerrar Sesión */}
          <TouchableOpacity
            onPress={async () => {
              await AsyncStorage.multiRemove([
                '@estimafacil:logged', '@estimafacil:email',
                '@estimafacil:remember', '@estimafacil:firstTime',
                '@estimafacil:user_id',
                'obra', 'frente',
              ]);
              router.replace('/(auth)/login');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="logout" size={18} color="#ba1a1a" />
            <Text style={{ fontSize: 14, color: '#ba1a1a', fontWeight: '600' }}>
              Cerrar Sesion
            </Text>
          </TouchableOpacity>
        </Card>

        {/* SUSCRIPCION */}
        <SectionTitle label="Suscripcion" />
        <Card>
          <TouchableOpacity
            onPress={() => router.push('/suscripcion')}
            style={{
              flexDirection: 'row', alignItems: 'center',
              justifyContent: 'space-between', paddingVertical: 4,
            }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialIcons name="vpn-key" size={20} color="#003d9b" />
              <View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#191c1e' }}>
                  Suscripcion / Canjear codigo
                </Text>
                <Text style={{ fontSize: 11, color: '#737685', marginTop: 2 }}>
                  Ver estado, planes y activar codigo
                </Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#c3c6d6" />
          </TouchableOpacity>
        </Card>

        {/* Guardar */}
        <TouchableOpacity
          onPress={handleSave}
          style={{
            marginTop: 8, backgroundColor: '#003d9b',
            borderRadius: 12, paddingVertical: 14,
            alignItems: 'center', flexDirection: 'row',
            justifyContent: 'center', gap: 8,
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="save" size={18} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
            Guardar cambios
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
