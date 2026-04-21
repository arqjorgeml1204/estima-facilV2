import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

async function clearSessionStorage() {
  const keys = await AsyncStorage.getAllKeys();
  const toRemove = keys.filter(
    (k) =>
      k === '@estimafacil:logged' ||
      k === '@estimafacil:user_id' ||
      k === '@estimafacil:user_data' ||
      k === '@estimafacil:email' ||
      k === '@estimafacil:remember' ||
      k === '@estimafacil:firstTime' ||
      k.startsWith('@estimafacil:sub_code:') ||
      k.startsWith('@estimafacil:sub_expires:') ||
      k.startsWith('@estimafacil:sub_type:') ||
      k.startsWith('@estimafacil:trial_started:'),
  );
  if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
}

export default function BlockScreen() {
  const handleLogout = async () => {
    await clearSessionStorage();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 32,
        }}
      >
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: '#e8edf7',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <MaterialIcons name="lock" size={48} color="#003d9b" />
        </View>

        <Text
          style={{
            fontSize: 22,
            fontWeight: '800',
            color: '#191c1e',
            textAlign: 'center',
            marginBottom: 10,
            letterSpacing: -0.3,
          }}
        >
          No tienes un plan activo
        </Text>

        <Text
          style={{
            fontSize: 14,
            color: '#434654',
            textAlign: 'center',
            lineHeight: 21,
            marginBottom: 32,
            maxWidth: 320,
          }}
        >
          Selecciona un plan para continuar utilizando EstimaFacil
        </Text>

        <TouchableOpacity
          onPress={() => router.push('/suscripcion')}
          activeOpacity={0.85}
          style={{
            backgroundColor: '#003d9b',
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 32,
            width: '100%',
            maxWidth: 320,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <MaterialIcons name="credit-card" size={18} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>
            Ver planes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleLogout}
          activeOpacity={0.8}
          style={{
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 32,
            width: '100%',
            maxWidth: 320,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#c3c6d6',
            backgroundColor: 'transparent',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <MaterialIcons name="logout" size={18} color="#737685" />
          <Text style={{ color: '#737685', fontSize: 14, fontWeight: '600' }}>
            Cerrar sesion
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
