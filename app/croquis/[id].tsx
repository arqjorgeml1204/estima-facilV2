/**
 * croquis/[id].tsx
 * Pantalla 4: Croquis del Frente — adjunta planos/sketches a la estimación.
 */

import {
  View, Text, TouchableOpacity, FlatList,
  Image, ActivityIndicator, SafeAreaView,
  Alert, TextInput, Modal, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  initDatabase, getEstimacionById, getProyectoById,
  getCroquisByEstimacion, insertCroquis, deleteCroquis,
} from '../../db/database';

interface CroquisItem {
  id: number;
  imagen_uri: string;
  descripcion: string;
  created_at: string;
}

export default function CroquisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [estimacion, setEstimacion] = useState<any>(null);
  const [proyecto, setProyecto] = useState<any>(null);
  const [croquisList, setCroquisList] = useState<CroquisItem[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [pendingUri, setPendingUri] = useState('');
  const [pendingDesc, setPendingDesc] = useState('');
  const [selectedItem, setSelectedItem] = useState<CroquisItem | null>(null);

  const load = async () => {
    await initDatabase();
    const est = await getEstimacionById(Number(id));
    if (!est) { setLoading(false); return; }
    const [proy, rows] = await Promise.all([
      getProyectoById(est.proyecto_id),
      getCroquisByEstimacion(Number(id)),
    ]);
    setEstimacion(est);
    setProyecto(proy);
    setCroquisList(rows as CroquisItem[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [id]));

  const handleExportPdf = async () => {
    if (croquisList.length === 0) {
      Alert.alert('Sin croquis', 'Agrega croquis antes de exportar.');
      return;
    }
    setExporting(true);
    try {
      // 1. Leer todas las imágenes en base64 ANTES de generar el HTML
      const base64Map: Record<number, string> = {};
      for (const c of croquisList) {
        try {
          const info = await FileSystem.getInfoAsync(c.imagen_uri);
          if (info.exists) {
            const b64 = await FileSystem.readAsStringAsync(c.imagen_uri, { encoding: 'base64' });
            base64Map[c.id] = b64;
          }
        } catch {}
      }

      // 2. Generar HTML con grid 2 croquis por hoja
      const perPage = 2;
      const chunks: CroquisItem[][] = [];
      for (let i = 0; i < croquisList.length; i += perPage) {
        chunks.push(croquisList.slice(i, i + perPage));
      }

      const pagesHtml = chunks.map((chunk, pi) => `
        <div class="${pi === 0 ? '' : 'page-break'}">
          <div class="page-header">
            CROQUIS DEL FRENTE &nbsp;·&nbsp; ${proyecto?.codigo ?? ''} &nbsp;·&nbsp; Est. #${estimacion?.numero ?? ''}
          </div>
          <div class="croquis-grid">
            ${chunk.map((c, ci) => {
              const b64 = base64Map[c.id];
              const imgSrc = b64 ? `data:image/jpeg;base64,${b64}` : '';
              return `
              <div class="croquis-item">
                ${imgSrc
                  ? `<img src="${imgSrc}"/>`
                  : `<div class="croquis-placeholder">Sin imagen</div>`}
                <div class="croquis-label">${pi * perPage + ci + 1}. ${c.descripcion || ''}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`).join('');

      const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/>
<style>
  @page { size: letter landscape; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #000; }
  .page-break { page-break-before: always; padding-top: 4px; }
  .page-header { font-size: 11px; font-weight: 700; color: #1F4E79; margin-bottom: 10px; text-transform: uppercase; border-bottom: 2px solid #1F4E79; padding-bottom: 4px; }
  .croquis-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; width: 100%; }
  .croquis-item { text-align: center; }
  .croquis-item img { width: 100%; object-fit: contain; max-height: 180mm; border: 1px solid #ccc; border-radius: 4px; }
  .croquis-placeholder { width: 100%; height: 180mm; background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; border: 1px dashed #ccc; border-radius: 4px; }
  .croquis-label { font-size: 7.5px; color: #555; margin-top: 4px; text-align: center; }
</style>
</head>
<body>${pagesHtml}</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false, width: 792, height: 612 });
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Compartir no disponible en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir PDF Croquis' });
    } catch {
      Alert.alert('Error', 'No se pudo generar el PDF de croquis.');
    } finally {
      setExporting(false);
    }
  };

  const pickSource = () => {
    Alert.alert('Agregar croquis', 'Selecciona la fuente', [
      { text: 'Cámara', onPress: () => pickImage('camera') },
      { text: 'Galería / Archivo', onPress: () => pickImage('library') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const pickImage = async (source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso requerido', 'Activa el acceso a la cámara en ajustes.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: false });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso requerido', 'Activa el acceso a la galería en ajustes.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9, allowsEditing: false,
      });
    }

    if (result.canceled || !result.assets?.[0]) return;
    const src = result.assets[0].uri;
    const filename = `croquis_${Date.now()}.jpg`;
    const dest = `${FileSystem.documentDirectory}${filename}`;
    try {
      await FileSystem.copyAsync({ from: src, to: dest });
      setPendingUri(dest);
    } catch {
      setPendingUri(src);
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!pendingUri) return;
    setSaving(true);
    await insertCroquis(Number(id), pendingUri, pendingDesc.trim() || undefined);
    setSaving(false);
    setShowModal(false);
    setPendingUri('');
    setPendingDesc('');
    await load();
  };

  const handleDelete = (item: CroquisItem) => {
    Alert.alert('Eliminar croquis', '¿Deseas eliminar este croquis?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await deleteCroquis(item.id);
          FileSystem.deleteAsync(item.imagen_uri, { idempotent: true }).catch(() => {});
          setSelectedItem(null);
          await load();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f9fb', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#003d9b" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fb' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#e1e2e4',
        backgroundColor: '#f8f9fb',
      }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={22} color="#003d9b" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#191c1e', letterSpacing: -0.3 }}>
            Croquis del Frente
          </Text>
          <Text style={{ fontSize: 10, color: '#737685', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {proyecto?.codigo ?? ''} · Est. #{estimacion?.numero ?? ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleExportPdf}
          activeOpacity={0.85}
          disabled={exporting || croquisList.length === 0}
          style={{
            backgroundColor: '#1F4E79', borderRadius: 8,
            paddingHorizontal: 10, paddingVertical: 7,
            flexDirection: 'row', alignItems: 'center', gap: 4,
            opacity: croquisList.length === 0 ? 0.4 : 1,
            marginRight: 4,
          }}
        >
          {exporting
            ? <ActivityIndicator size={14} color="#ffffff" />
            : <MaterialIcons name="picture-as-pdf" size={14} color="#ffffff" />}
          <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={pickSource}
          activeOpacity={0.85}
          style={{
            backgroundColor: '#003d9b', borderRadius: 8,
            paddingHorizontal: 12, paddingVertical: 7,
            flexDirection: 'row', alignItems: 'center', gap: 5,
          }}
        >
          <MaterialIcons name="add" size={14} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>Agregar</Text>
        </TouchableOpacity>
      </View>

      {/* Fullscreen viewer when item selected */}
      {selectedItem ? (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <TouchableOpacity
            onPress={() => setSelectedItem(null)}
            style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}
          >
            <MaterialIcons name="close" size={22} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(selectedItem)}
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, padding: 8, backgroundColor: 'rgba(220,53,69,0.8)', borderRadius: 20 }}
          >
            <MaterialIcons name="delete" size={22} color="#ffffff" />
          </TouchableOpacity>
          <Image
            source={{ uri: selectedItem.imagen_uri }}
            style={{ flex: 1 }}
            resizeMode="contain"
          />
          {selectedItem.descripcion ? (
            <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', padding: 16 }}>
              <Text style={{ color: '#ffffff', fontSize: 14, textAlign: 'center' }}>
                {selectedItem.descripcion}
              </Text>
            </View>
          ) : null}
        </View>
      ) : croquisList.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <MaterialIcons name="map" size={64} color="#c3c6d6" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#191c1e', marginTop: 16, textAlign: 'center' }}>
            Sin croquis
          </Text>
          <Text style={{ fontSize: 13, color: '#737685', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            Agrega planos, sketches o fotos{'\n'}del frente de trabajo
          </Text>
          <TouchableOpacity
            onPress={pickSource}
            style={{ marginTop: 24, backgroundColor: '#003d9b', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700' }}>Agregar croquis</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {croquisList.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => setSelectedItem(item)}
              activeOpacity={0.9}
              style={{ backgroundColor: '#ffffff', borderRadius: 14, overflow: 'hidden' }}
            >
              <Image
                source={{ uri: item.imagen_uri }}
                style={{ width: '100%', aspectRatio: 16 / 10 }}
                resizeMode="cover"
              />
              <View style={{ padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  {item.descripcion ? (
                    <Text style={{ fontSize: 13, color: '#191c1e', fontWeight: '600' }} numberOfLines={1}>
                      {item.descripcion}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: '#c3c6d6' }}>Sin descripción</Text>
                  )}
                  <Text style={{ fontSize: 10, color: '#737685', marginTop: 2 }}>
                    {new Date(item.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="delete-outline" size={20} color="#e74c3c" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Add modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'flex-end',
        }}>
          <View style={{
            backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#191c1e', marginBottom: 16 }}>
              Nuevo croquis
            </Text>

            {pendingUri ? (
              <Image
                source={{ uri: pendingUri }}
                style={{ width: '100%', height: 160, borderRadius: 10, marginBottom: 16 }}
                resizeMode="cover"
              />
            ) : null}

            <Text style={{ fontSize: 11, fontWeight: '700', color: '#434654', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Descripción (opcional)
            </Text>
            <TextInput
              value={pendingDesc}
              onChangeText={setPendingDesc}
              placeholder="Ej. Croquis frente norte — semana 12"
              placeholderTextColor="#c3c6d6"
              style={{
                backgroundColor: '#e7e8ea', borderRadius: 8,
                paddingHorizontal: 14, paddingVertical: 10,
                fontSize: 14, color: '#191c1e', marginBottom: 20,
                borderBottomWidth: 2, borderBottomColor: '#003d9b',
              }}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setShowModal(false); setPendingUri(''); }}
                style={{
                  flex: 1, borderRadius: 10, paddingVertical: 13,
                  backgroundColor: '#e7e8ea', alignItems: 'center',
                }}
              >
                <Text style={{ color: '#737685', fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={{
                  flex: 2, borderRadius: 10, paddingVertical: 13,
                  backgroundColor: '#003d9b', alignItems: 'center',
                  flexDirection: 'row', justifyContent: 'center', gap: 8,
                }}
              >
                {saving
                  ? <ActivityIndicator size={16} color="#ffffff" />
                  : <MaterialIcons name="save" size={16} color="#ffffff" />}
                <Text style={{ color: '#ffffff', fontWeight: '700' }}>
                  {saving ? 'Guardando…' : 'Guardar croquis'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
