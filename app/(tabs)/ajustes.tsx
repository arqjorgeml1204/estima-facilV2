/**
 * ajustes.tsx
 * Pantalla de configuración: nombre empresa, RFC.
 */

import {
  View, Text, TextInput, TouchableOpacity,
  SafeAreaView, ScrollView, Alert,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { upsertEmpresa, getEmpresa } from '../../db/database';

export default function AjustesScreen() {
  const [saved, setSaved]     = useState(false);

  // useRef para texto libre — evita re-render que destruye el teclado
  const nombreRef = useRef<string>('');
  const rfcRef    = useRef<string>('');

  // initialValues solo para defaultValue (se leen una vez al montar)
  const [initialNombre, setInitialNombre] = useState('');
  const [initialRfc, setInitialRfc]       = useState('');

  useEffect(() => {
    (async () => {
      const empresa = await getEmpresa();
      if (empresa) {
        const n = empresa.nombre ?? '';
        const r = empresa.rfc ?? '';
        setInitialNombre(n);
        setInitialRfc(r);
        nombreRef.current = n;
        rfcRef.current    = r;
      }
    })();
  }, []);

  const handleSave = async () => {
    const nombre = nombreRef.current;
    const rfc    = rfcRef.current;
    if (!nombre.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre de tu empresa.');
      return;
    }
    await upsertEmpresa(nombre.trim(), rfc.trim() || undefined);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Field = ({ label, defaultValue, onChangeText, placeholder, secureTextEntry = false }: any) => (
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
        secureTextEntry={secureTextEntry}
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      <View style={{
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#e1e2e4',
      }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#191c1e', letterSpacing: -0.5 }}>
          Ajustes
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Empresa */}
        <Text style={{
          fontSize: 11, fontWeight: '700', color: '#003d9b',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
        }}>
          Mi Empresa
        </Text>
        <View style={{
          backgroundColor: '#ffffff', borderRadius: 12,
          padding: 16, marginBottom: 24,
          shadowColor: '#191c1e', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
        }}>
          <Field
            label="Nombre de la empresa"
            defaultValue={initialNombre}
            onChangeText={(v: string) => { nombreRef.current = v; }}
            placeholder="Constructora ABC S.A. de C.V."
          />
          <Field
            label="RFC"
            defaultValue={initialRfc}
            onChangeText={(v: string) => { rfcRef.current = v; }}
            placeholder="XAXX010101000"
          />
        </View>

        {/* Guardar */}
        <TouchableOpacity
          onPress={handleSave}
          style={{
            marginTop: 8,
            backgroundColor: saved ? '#004f11' : '#003d9b',
            borderRadius: 12, paddingVertical: 14,
            alignItems: 'center', flexDirection: 'row',
            justifyContent: 'center', gap: 8,
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name={saved ? 'check' : 'save'} size={18} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
            {saved ? 'Guardado' : 'Guardar cambios'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
