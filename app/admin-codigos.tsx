/**
 * admin-codigos.tsx
 * Pantalla admin para ver y revocar codigos canjeados.
 * Acceso protegido por password (OWNER_PASSWORD abajo).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { listRedeemedCodes, revokeCode } from '../utils/subscription';

// Password que da acceso a esta pantalla. Cambiar por algo seguro antes de publicar.
const OWNER_PASSWORD = 'ARQJO_ADMIN_2026';

interface CanjeoRow {
  code: string;
  type: string;
  days: number;
  used_by: string;
  used_at: string;
  is_revoked: boolean;
  revoked_at: string | null;
}

export default function AdminCodigos() {
  const [authed, setAuthed] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CanjeoRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listRedeemedCodes();
      setRows(data);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudieron cargar los codigos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  const handleAuth = () => {
    if (passInput === OWNER_PASSWORD) {
      setAuthed(true);
      setPassInput('');
    } else {
      Alert.alert('Acceso denegado', 'Contrasena incorrecta.');
      setPassInput('');
    }
  };

  const handleRevoke = (code: string) => {
    Alert.alert(
      'Revocar codigo',
      `Se revocara el codigo ${code}. La suscripcion del usuario se invalidara cuando abra la app.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revocar',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeCode(code);
              await load();
              Alert.alert('Listo', 'Codigo revocado.');
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'No se pudo revocar.');
            }
          },
        },
      ],
    );
  };

  if (!authed) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
            <MaterialIcons name="arrow-back" size={22} color="#003d9b" />
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#191c1e', marginLeft: 8 }}>Admin</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#191c1e', marginBottom: 8 }}>
            Contrasena de administrador
          </Text>
          <TextInput
            value={passInput}
            onChangeText={setPassInput}
            secureTextEntry
            autoCapitalize="none"
            style={{
              backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#c3c6d6',
              padding: 12, fontSize: 14,
            }}
            placeholder="Contrasena"
          />
          <TouchableOpacity
            onPress={handleAuth}
            style={{
              marginTop: 16, backgroundColor: '#003d9b', borderRadius: 10,
              paddingVertical: 13, alignItems: 'center',
            }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700' }}>Entrar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
            <MaterialIcons name="arrow-back" size={22} color="#003d9b" />
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#191c1e', marginLeft: 8 }}>
            Codigos canjeados
          </Text>
        </View>
        <TouchableOpacity onPress={load} style={{ padding: 6 }}>
          <MaterialIcons name="refresh" size={22} color="#003d9b" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#003d9b" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.code}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: '#737685', fontSize: 13 }}>Sin codigos canjeados aun.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 8, padding: 12, marginBottom: 8,
              borderLeftWidth: 4, borderLeftColor: item.is_revoked ? '#D32F2F' : '#1A7A3C',
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#191c1e' }}>{item.code}</Text>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 2, borderRadius: 3,
                  backgroundColor: item.is_revoked ? '#D32F2F' : '#1A7A3C',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#ffffff' }}>
                    {item.is_revoked ? 'REVOCADO' : 'ACTIVO'}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: '#737685', marginTop: 4 }}>
                Plan: {item.type} · {item.days} dias
              </Text>
              <Text style={{ fontSize: 11, color: '#737685' }}>
                Usuario: {item.used_by}
              </Text>
              <Text style={{ fontSize: 11, color: '#737685' }}>
                Canjeado: {item.used_at ? new Date(item.used_at).toLocaleString('es-MX') : '-'}
              </Text>
              {item.is_revoked && item.revoked_at && (
                <Text style={{ fontSize: 11, color: '#D32F2F' }}>
                  Revocado: {new Date(item.revoked_at).toLocaleString('es-MX')}
                </Text>
              )}
              {!item.is_revoked && (
                <TouchableOpacity
                  onPress={() => handleRevoke(item.code)}
                  style={{
                    marginTop: 8, backgroundColor: '#D32F2F', borderRadius: 6,
                    paddingVertical: 8, alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>REVOCAR</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
