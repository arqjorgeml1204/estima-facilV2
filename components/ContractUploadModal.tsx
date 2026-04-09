/**
 * ContractUploadModal.tsx
 * Modal de primera vez: solicita cargar el PDF del contrato,
 * extrae datos automáticamente y puebla la base de datos.
 */

import {
  View, Text, TouchableOpacity, Modal, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native';
import { useState, useRef, useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { PdfDeterministicExtractor, ContratoExtraido } from '../services/pdfExtractor';
import { seedFromContract, getEmpresa, upsertEmpresa } from '../db/database';
import { getCurrentUserId } from '../utils/auth';
import PdfWebViewBridge, { PdfBridgeRef } from '../services/pdfExtractor/PdfWebViewBridge';

// ── Pasos del flujo ────────────────────────────────────────────────────────────
type Step = 'idle' | 'picking' | 'extracting' | 'preview' | 'saving' | 'done' | 'error';

interface Props {
  visible: boolean;
  onComplete: (proyectoId: number) => void;
  onSkip?: () => void;
}

export default function ContractUploadModal({ visible, onComplete, onSkip }: Props) {
  const [step, setStep]           = useState<Step>('idle');
  const [contrato, setContrato]   = useState<ContratoExtraido | null>(null);
  const [fileName, setFileName]   = useState('');
  const [errorMsg, setErrorMsg]   = useState('');
  const bridgeRef                 = useRef<PdfBridgeRef>(null);

  // Reset state when modal reopens (fixes #7: stuck on "contrato cargado")
  useEffect(() => {
    if (visible) {
      setStep('idle');
      setContrato(null);
      setErrorMsg('');
      setFileName('');
    }
  }, [visible]);

  // ── 1. Seleccionar PDF ─────────────────────────────────────────────────────
  const handlePickPDF = async () => {
    setStep('picking');
    setErrorMsg('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        setStep('idle');
        return;
      }
      const file = result.assets[0];
      setFileName(file.name);
      await handleExtract(file.uri);
    } catch (e: any) {
      setErrorMsg('No se pudo abrir el archivo. Intenta de nuevo.');
      setStep('error');
    }
  };

  // ── 2. Extraer con el extractor determinístico ─────────────────────────────
  const handleExtract = async (uri: string) => {
    setStep('extracting');
    try {
      const extractor = new PdfDeterministicExtractor(bridgeRef.current!);
      const data = await extractor.extract(uri);
      setContrato(data);
      setStep('preview');
    } catch (e: any) {
      setErrorMsg(`Error al analizar el PDF: ${e.message}`);
      setStep('error');
    }
  };

  // ── 3. Confirmar y guardar ─────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!contrato) return;
    setStep('saving');
    try {
      const userId = await getCurrentUserId();
      let empresa = await getEmpresa(userId);
      if (!empresa) {
        await upsertEmpresa('Mi Empresa', undefined, undefined, userId);
        empresa = await getEmpresa(userId);
      }
      const empresaId = empresa!.id;
      const proyectoId = await seedFromContract(contrato, empresaId, userId);
      setStep('done');
      setTimeout(() => onComplete(proyectoId), 800);
    } catch (e: any) {
      setErrorMsg(`Error al guardar: ${e.message}`);
      setStep('error');
    }
  };

  const handleRetry = () => {
    setStep('idle');
    setContrato(null);
    setErrorMsg('');
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <>
    <Modal visible={visible} animationType="fade" transparent>
      <View style={{
        flex: 1, backgroundColor: 'rgba(25,28,30,0.6)',
        justifyContent: 'center', alignItems: 'center',
        padding: 24,
      }}>
        <View style={{
          backgroundColor: '#ffffff', borderRadius: 20,
          width: '100%', maxWidth: 480,
          shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.15, shadowRadius: 32, elevation: 12,
          overflow: 'hidden',
        }}>

          {/* Header azul */}
          <View style={{ backgroundColor: '#003d9b', padding: 24, paddingBottom: 20 }}>
            <Text style={{
              fontSize: 20, fontWeight: '800', color: '#ffffff',
              fontFamily: 'Manrope',
            }}>
              {step === 'done' ? '¡Contrato cargado!' : 'Cargar contrato'}
            </Text>
            <Text style={{
              fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4,
              fontFamily: 'Inter',
            }}>
              {step === 'idle' && 'Carga tu contrato PDF para comenzar'}
              {step === 'extracting' && `Analizando: ${fileName}`}
              {step === 'preview' && 'Verifica la información extraída'}
              {step === 'saving' && 'Guardando en tu dispositivo...'}
              {step === 'done' && 'Datos guardados correctamente'}
              {step === 'error' && 'Ocurrió un problema'}
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 24 }}>

            {/* IDLE: Instrucción inicial */}
            {step === 'idle' && (
              <View style={{ gap: 20 }}>
                <View style={{
                  backgroundColor: '#f3f4f6', borderRadius: 12,
                  padding: 16,
                }}>
                  <Text style={{ fontSize: 14, color: '#434654', fontFamily: 'Inter', textAlign: 'center', lineHeight: 22 }}>
                    Sube tu contrato para comenzar con la estimación
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#737685', fontFamily: 'Inter', lineHeight: 16 }}>
                  El análisis se realiza localmente en tu dispositivo. No requiere conexión a internet.
                </Text>
              </View>
            )}

            {/* EXTRACTING / SAVING: Loader */}
            {(step === 'extracting' || step === 'saving' || step === 'picking') && (
              <View style={{ alignItems: 'center', paddingVertical: 32, gap: 16 }}>
                <ActivityIndicator size="large" color="#003d9b" />
                <Text style={{ fontSize: 14, color: '#434654', fontFamily: 'Inter', fontWeight: '600', textAlign: 'center' }}>
                  {step === 'extracting' && 'Extrayendo información del contrato...\nEsto tomará unos segundos.'}
                  {step === 'saving' && 'Guardando datos en tu dispositivo...'}
                  {step === 'picking' && 'Abriendo selector de archivos...'}
                </Text>
              </View>
            )}

            {/* PREVIEW: Datos extraídos */}
            {step === 'preview' && contrato && (
              <View style={{ gap: 12 }}>
                <Text style={{
                  fontSize: 11, fontWeight: '700', color: '#003d9b',
                  textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter',
                }}>
                  Datos extraídos del contrato
                </Text>

                {[
                  { label: 'Contratista', value: contrato.contratista ?? '—' },
                  { label: 'No. Contrato', value: contrato.numeroContrato ?? '—' },
                  { label: 'Conjunto', value: contrato.conjunto ?? '—' },
                  { label: 'Monto Contrato', value: contrato.montoContrato != null ? `$${contrato.montoContrato.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—' },
                  { label: 'Factor Total', value: `${contrato.conceptos[0]?.factorTotal ?? '—'} viviendas` },
                  { label: 'Prototipo', value: contrato.conceptos[0]?.prototipos[0] ?? '—' },
                  { label: 'Conceptos cargados', value: `${contrato.conceptos.length} conceptos` },
                ].map(({ label, value }) => (
                  <View key={label} style={{
                    flexDirection: 'row', justifyContent: 'space-between',
                    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
                  }}>
                    <Text style={{ fontSize: 12, color: '#737685', fontFamily: 'Inter', fontWeight: '600' }}>
                      {label}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#191c1e', fontFamily: 'Inter', fontWeight: '700', maxWidth: '55%', textAlign: 'right' }}>
                      {value}
                    </Text>
                  </View>
                ))}

                <View style={{
                  backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, marginTop: 4,
                }}>
                  <Text style={{ fontSize: 11, color: '#737685', fontFamily: 'Inter', fontWeight: '600', marginBottom: 4 }}>
                    DESCRIPCIÓN DEL CONTRATO
                  </Text>
                  <Text style={{ fontSize: 11, color: '#434654', fontFamily: 'Inter', lineHeight: 16 }}>
                    {contrato.descripcionObra ?? 'Sin descripción'}
                  </Text>
                </View>
              </View>
            )}

            {/* DONE */}
            {step === 'done' && (
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 28,
                  backgroundColor: '#a3f69c', justifyContent: 'center', alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 24 }}>✓</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#004f11', fontFamily: 'Inter' }}>
                  Contrato listo
                </Text>
              </View>
            )}

            {/* ERROR */}
            {step === 'error' && (
              <View style={{
                backgroundColor: '#ffdad6', borderRadius: 12, padding: 16, gap: 8,
              }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#93000a', fontFamily: 'Inter' }}>
                  No se pudo procesar el PDF
                </Text>
                <Text style={{ fontSize: 12, color: '#93000a', fontFamily: 'Inter', lineHeight: 18 }}>
                  {errorMsg}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Botones */}
          <View style={{
            padding: 20, paddingTop: 0, gap: 10,
            borderTopWidth: 1, borderTopColor: '#f3f4f6',
          }}>
            {step === 'idle' && (
              <>
                <TouchableOpacity
                  onPress={handlePickPDF}
                  style={{
                    backgroundColor: '#003d9b', borderRadius: 12,
                    paddingVertical: 14, alignItems: 'center',
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Inter' }}>
                    Seleccionar PDF del contrato
                  </Text>
                </TouchableOpacity>
                {onSkip && (
                  <TouchableOpacity onPress={onSkip} style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: '#737685', fontFamily: 'Inter' }}>
                      Cerrar
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {step === 'preview' && (
              <>
                <TouchableOpacity
                  onPress={handleConfirm}
                  style={{
                    backgroundColor: '#003d9b', borderRadius: 12,
                    paddingVertical: 14, alignItems: 'center',
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Inter' }}>
                    Confirmar y guardar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleRetry}
                  style={{ paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 13, color: '#737685', fontFamily: 'Inter' }}>
                    Cargar otro PDF
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'error' && (
              <TouchableOpacity
                onPress={handleRetry}
                style={{
                  backgroundColor: '#003d9b', borderRadius: 12,
                  paddingVertical: 14, alignItems: 'center',
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Inter' }}>
                  Intentar de nuevo
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
    <PdfWebViewBridge ref={bridgeRef} />
  </>
  );
}
