/**
 * evidencia/[id].tsx
 * Pantalla 3: Anexo Fotográfico — captura y gestión de evidencias por estimación.
 */

import {
  View, Text, TouchableOpacity, FlatList,
  Image, ActivityIndicator, SafeAreaView,
  Alert, TextInput, Modal, Platform,
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
  getEvidenciasByEstimacion, insertEvidencia, deleteEvidencia,
} from '../../db/database';

interface EvidenciaItem {
  id: number;
  imagen_uri: string;
  actividad: string;
  descripcion: string;
  created_at: string;
}

export default function EvidenciaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [estimacion, setEstimacion] = useState<any>(null);
  const [proyecto, setProyecto] = useState<any>(null);
  const [evidencias, setEvidencias] = useState<EvidenciaItem[]>([]);

  // Modal agregar
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingUri, setPendingUri] = useState('');
  const [pendingActividad, setPendingActividad] = useState('');
  const [pendingDesc, setPendingDesc] = useState('');

  const load = async () => {
    await initDatabase();
    const est = await getEstimacionById(Number(id));
    if (!est) { setLoading(false); return; }
    const [proy, rows] = await Promise.all([
      getProyectoById(est.proyecto_id),
      getEvidenciasByEstimacion(Number(id)),
    ]);
    setEstimacion(est);
    setProyecto(proy);
    setEvidencias(rows as EvidenciaItem[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [id]));

  const handleExportPdf = async () => {
    if (evidencias.length === 0) {
      Alert.alert('Sin evidencias', 'Agrega fotos antes de exportar.');
      return;
    }
    setExporting(true);
    try {
      // 1. Leer todas las imágenes en base64 ANTES de generar el HTML
      const base64Map: Record<number, string> = {};
      for (const ev of evidencias) {
        try {
          const info = await FileSystem.getInfoAsync(ev.imagen_uri);
          if (info.exists) {
            const b64 = await FileSystem.readAsStringAsync(ev.imagen_uri, { encoding: 'base64' });
            base64Map[ev.id] = b64;
          }
        } catch {}
      }

      // 2. Generar HTML con grid 3 cols × 2 filas = 6 fotos por hoja
      const perPage = 6;
      const chunks: EvidenciaItem[][] = [];
      for (let i = 0; i < evidencias.length; i += perPage) {
        chunks.push(evidencias.slice(i, i + perPage));
      }

      const pagesHtml = chunks.map((chunk, pi) => `
        <div class="${pi === 0 ? '' : 'page-break'}">
          <div class="page-header">
            EVIDENCIA FOTOGRÁFICA &nbsp;·&nbsp; ${proyecto?.codigo ?? ''} &nbsp;·&nbsp; Est. #${estimacion?.numero ?? ''}
          </div>
          <div class="foto-grid">
            ${chunk.map((f, fi) => {
              const b64 = base64Map[f.id];
              const imgSrc = b64 ? `data:image/jpeg;base64,${b64}` : '';
              return `
              <div class="foto-cell">
                ${imgSrc
                  ? `<img src="${imgSrc}" class="foto-img"/>`
                  : `<div class="foto-placeholder">Sin imagen</div>`}
                <div class="foto-label">${pi * perPage + fi + 1}. ${f.actividad ? f.actividad + ' — ' : ''}${f.descripcion || ''}</div>
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
  .page-header { font-size: 11px; font-weight: 700; color: #1F4E79; margin-bottom: 8px; text-transform: uppercase; border-bottom: 2px solid #1F4E79; padding-bottom: 4px; }
  .foto-grid { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); gap: 8px; width: 100%; height: calc(100vh - 40mm); }
  .foto-cell { display: flex; flex-direction: column; align-items: center; overflow: hidden; }
  .foto-img { width: 100%; flex: 1; object-fit: contain; max-height: 120mm; border: 1px solid #ccc; border-radius: 4px; }
  .foto-placeholder { width: 100%; flex: 1; background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; border: 1px dashed #ccc; border-radius: 4px; }
  .foto-label { font-size: 7px; color: #555; margin-top: 3px; text-align: center; width: 100%; }
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
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir PDF Evidencias' });
    } catch {
      Alert.alert('Error', 'No se pudo generar el PDF de evidencias.');
    } finally {
      setExporting(false);
    }
  };

  const pickSource = () => {
    Alert.alert('Agregar evidencia', 'Selecciona la fuente', [
      { text: 'Cámara', onPress: () => pickImage('camera') },
      { text: 'Galería', onPress: () => pickImage('library') },
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
      result = await ImagePicker.launchCameraAsync({
        quality: 0.75, allowsEditing: false,
      });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso requerido', 'Activa el acceso a la galería en ajustes.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.75, allowsEditing: false,
      });
    }

    if (result.canceled || !result.assets?.[0]) return;

    // Copy to app's document directory for persistence
    const src = result.assets[0].uri;
    const filename = `ev_${Date.now()}.jpg`;
    const dest = `${FileSystem.documentDirectory}${filename}`;
    try {
      await FileSystem.copyAsync({ from: src, to: dest });
      setPendingUri(dest);
      setShowAddModal(true);
    } catch {
      setPendingUri(src);
      setShowAddModal(true);
    }
  };

  const handleSave = async () => {
    if (!pendingUri) return;
    setSaving(true);
    await insertEvidencia(Number(id), pendingUri, pendingActividad.trim() || undefined, pendingDesc.trim() || undefined);
    setSaving(false);
    setShowAddModal(false);
    setPendingUri('');
    setPendingActividad('');
    setPendingDesc('');
    await load();
  };

  const handleDelete = (ev: EvidenciaItem) => {
    Alert.alert('Eliminar evidencia', '¿Deseas eliminar esta foto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await deleteEvidencia(ev.id);
          // Attempt to delete file (best effort)
          FileSystem.deleteAsync(ev.imagen_uri, { idempotent: true }).catch(() => {});
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

  const numCols = 2;

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
            Anexo Fotográfico
          </Text>
          <Text style={{ fontSize: 10, color: '#737685', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {proyecto?.codigo ?? ''} · Est. #{estimacion?.numero ?? ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleExportPdf}
          activeOpacity={0.85}
          disabled={exporting || evidencias.length === 0}
          style={{
            backgroundColor: '#1F4E79', borderRadius: 8,
            paddingHorizontal: 10, paddingVertical: 7,
            flexDirection: 'row', alignItems: 'center', gap: 4,
            opacity: evidencias.length === 0 ? 0.4 : 1,
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
          <MaterialIcons name="add-a-photo" size={14} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>Agregar</Text>
        </TouchableOpacity>
      </View>

      {evidencias.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <MaterialIcons name="photo-library" size={64} color="#c3c6d6" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#191c1e', marginTop: 16, textAlign: 'center' }}>
            Sin evidencias
          </Text>
          <Text style={{ fontSize: 13, color: '#737685', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            Agrega fotos desde la cámara{'\n'}o selecciona de tu galería
          </Text>
          <TouchableOpacity
            onPress={pickSource}
            style={{ marginTop: 24, backgroundColor: '#003d9b', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700' }}>Agregar foto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={evidencias}
          keyExtractor={item => item.id.toString()}
          numColumns={numCols}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          columnWrapperStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <View style={{
              flex: 1, backgroundColor: '#ffffff', borderRadius: 12,
              overflow: 'hidden',
            }}>
              <Image
                source={{ uri: item.imagen_uri }}
                style={{ width: '100%', aspectRatio: 4 / 3 }}
                resizeMode="cover"
              />
              <View style={{ padding: 10 }}>
                {item.actividad ? (
                  <Text style={{ fontSize: 9, color: '#003d9b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                    {item.actividad}
                  </Text>
                ) : null}
                {item.descripcion ? (
                  <Text style={{ fontSize: 11, color: '#434654', lineHeight: 16 }} numberOfLines={2}>
                    {item.descripcion}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ fontSize: 9, color: '#c3c6d6' }}>
                    {new Date(item.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </Text>
                  <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="delete-outline" size={18} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Add modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'flex-end',
        }}>
          <View style={{
            backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#191c1e', marginBottom: 16 }}>
              Detalles de la foto
            </Text>

            {pendingUri ? (
              <Image
                source={{ uri: pendingUri }}
                style={{ width: '100%', height: 140, borderRadius: 10, marginBottom: 14 }}
                resizeMode="cover"
              />
            ) : null}

            <Text style={{ fontSize: 11, fontWeight: '700', color: '#434654', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Actividad (opcional)
            </Text>
            <TextInput
              value={pendingActividad}
              onChangeText={setPendingActividad}
              placeholder="Ej. 4.10.0002"
              placeholderTextColor="#c3c6d6"
              style={{
                backgroundColor: '#e7e8ea', borderRadius: 8,
                paddingHorizontal: 14, paddingVertical: 10,
                fontSize: 14, color: '#191c1e', marginBottom: 12,
                borderBottomWidth: 2, borderBottomColor: '#003d9b',
              }}
            />

            <Text style={{ fontSize: 11, fontWeight: '700', color: '#434654', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Descripción (opcional)
            </Text>
            <TextInput
              value={pendingDesc}
              onChangeText={setPendingDesc}
              placeholder="Describe lo que se observa en la foto"
              placeholderTextColor="#c3c6d6"
              multiline
              numberOfLines={2}
              style={{
                backgroundColor: '#e7e8ea', borderRadius: 8,
                paddingHorizontal: 14, paddingVertical: 10,
                fontSize: 14, color: '#191c1e', marginBottom: 20,
                borderBottomWidth: 2, borderBottomColor: '#003d9b',
                textAlignVertical: 'top',
              }}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setShowAddModal(false); setPendingUri(''); }}
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
                  {saving ? 'Guardando…' : 'Guardar foto'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
