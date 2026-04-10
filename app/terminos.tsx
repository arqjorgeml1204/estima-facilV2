import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

export default function TerminosScreen() {
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e1e2e4', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={24} color="#191c1e" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#191c1e' }}>Términos y Condiciones</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 14, color: '#191c1e', lineHeight: 22 }}>
          [Contenido legal pendiente — será actualizado próximamente]
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
