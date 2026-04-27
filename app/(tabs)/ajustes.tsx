/**
 * ajustes.tsx
 * Pantalla de configuracion rediseñada.
 *
 * Refactor: soporte de multiples obras (perfiles).
 *   - Dropdown de obras + acciones (agregar, renombrar, eliminar).
 *   - Cada obra persiste REALIZA / REVISA / AUTORIZA.
 *   - La obra activa se usa en el PDF (ver app/pdf/soporte/[id].tsx).
 *   - Campo FRENTE eliminado de la UI (queda deprecated en el modelo).
 *
 * Secciones: MI EMPRESA (obras) / MI CUENTA / SUSCRIPCION.
 */

import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { getCurrentUserId, clearSessionState } from '../../utils/auth';
import {
  Obra,
  getObras,
  getObraActiva,
  setObraActiva,
  upsertObra,
  deleteObra,
  createObra,
  migrateLegacyObra,
} from '../../utils/obras';

export default function AjustesScreen() {
  const router = useRouter();

  // ── Obras state ─────────────────────────────────────────────────────────────
  const [obras, setObras] = useState<Obra[]>([]);
  const [activaId, setActivaId] = useState<string>('');
  // Campos editables de la obra activa (useRef patron: evita re-render que
  // destruye el teclado mientras el usuario escribe).
  const nombreRef = useRef<string>('');
  const realizaRef = useRef<string>('');
  const revisaRef = useRef<string>('');
  const autorizaRef = useRef<string>('');
  // Valores iniciales para los defaultValue (cambian al conmutar obra activa).
  const [initialNombre, setInitialNombre] = useState('');
  const [initialRealiza, setInitialRealiza] = useState('');
  const [initialRevisa, setInitialRevisa] = useState('');
  const [initialAutoriza, setInitialAutoriza] = useState('');

  // ── UI state: selector y modales ────────────────────────────────────────────
  const [obraMenuOpen, setObraMenuOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'rename' | null>(null);
  const [modalInput, setModalInput] = useState('');

  // ── Cuenta ──────────────────────────────────────────────────────────────────
  const [userAccount, setUserAccount] = useState('');
  const [editingPassword, setEditingPassword] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass,     setShowNewPass]     = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── Carga + migracion legacy en primer mount ────────────────────────────────
  const loadObras = useCallback(async () => {
    await migrateLegacyObra(); // idempotente
    const list = await getObras();
    const activa = await getObraActiva();
    setObras(list);
    if (activa) {
      setActivaId(activa.id);
      nombreRef.current = activa.nombre;
      realizaRef.current = activa.realiza ?? '';
      revisaRef.current = activa.revisa ?? '';
      autorizaRef.current = activa.autoriza ?? '';
      setInitialNombre(activa.nombre);
      setInitialRealiza(activa.realiza ?? '');
      setInitialRevisa(activa.revisa ?? '');
      setInitialAutoriza(activa.autoriza ?? '');
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadObras();
      const userId = await getCurrentUserId();
      setUserAccount(userId === 'default' ? 'Sin cuenta' : userId);
    })();
  }, [loadObras]);

  // ── Conmutar obra activa ────────────────────────────────────────────────────
  const handleSelectObra = useCallback(async (id: string) => {
    if (!id || id === activaId) {
      setObraMenuOpen(false);
      return;
    }
    // Antes de cambiar, persiste cambios pendientes de la obra actual
    if (activaId) {
      const current = obras.find(o => o.id === activaId);
      if (current) {
        await upsertObra({
          ...current,
          nombre: nombreRef.current || current.nombre,
          realiza: realizaRef.current,
          revisa: revisaRef.current,
          autoriza: autorizaRef.current,
        });
      }
    }
    await setObraActiva(id);
    setObraMenuOpen(false);
    await loadObras();
  }, [activaId, obras, loadObras]);

  // ── Crear / renombrar obra ──────────────────────────────────────────────────
  const openCreateModal = () => {
    setModalInput('');
    setModalMode('create');
  };
  const openRenameModal = () => {
    setModalInput(nombreRef.current || initialNombre);
    setModalMode('rename');
  };
  const closeModal = () => {
    setModalMode(null);
    setModalInput('');
  };

  const handleModalConfirm = useCallback(async () => {
    const name = modalInput.trim();
    if (!name) {
      Alert.alert('Nombre requerido', 'Escribe un nombre para la obra.');
      return;
    }
    if (modalMode === 'create') {
      const created = await createObra(name);
      await setObraActiva(created.id);
      closeModal();
      await loadObras();
    } else if (modalMode === 'rename') {
      const current = obras.find(o => o.id === activaId);
      if (current) {
        await upsertObra({
          ...current,
          nombre: name,
          realiza: realizaRef.current,
          revisa: revisaRef.current,
          autoriza: autorizaRef.current,
        });
      }
      closeModal();
      await loadObras();
    }
  }, [modalMode, modalInput, obras, activaId, loadObras]);

  // ── Eliminar obra ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    if (obras.length <= 1) {
      Alert.alert('No disponible', 'Debe existir al menos una obra. Crea otra antes de eliminar esta.');
      return;
    }
    const current = obras.find(o => o.id === activaId);
    if (!current) return;
    Alert.alert(
      'Eliminar obra',
      `¿Seguro que deseas eliminar "${current.nombre}"? Esta accion no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteObra(current.id);
              await loadObras();
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'No se pudo eliminar la obra.');
            }
          },
        },
      ],
    );
  }, [obras, activaId, loadObras]);

  // ── Guardar cambios (obra activa + password) ────────────────────────────────
  const handleSave = async () => {
    if (editingPassword && newPassword !== confirmPassword) {
      Alert.alert('Error', 'La nueva contrasena y la confirmacion no coinciden.');
      return;
    }
    const current = obras.find(o => o.id === activaId);
    if (current) {
      await upsertObra({
        ...current,
        nombre: (nombreRef.current || current.nombre).trim(),
        realiza: realizaRef.current.trim(),
        revisa: revisaRef.current.trim(),
        autoriza: autorizaRef.current.trim(),
      });
    }
    if (editingPassword) {
      // TODO: AuthService.updatePassword(currentPassword, newPassword)
    }
    await loadObras();
    Alert.alert('Guardado', 'Cambios guardados correctamente');
  };

  // ── Subcomponentes de UI ────────────────────────────────────────────────────
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
        key={label + '_' + activaId}
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

  const activaObra = obras.find(o => o.id === activaId) ?? null;

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

      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">

        {/* MI EMPRESA */}
        <SectionTitle label="Mi Empresa" />
        <Card>
          {/* Selector de obra + acciones */}
          <Text style={{
            fontSize: 11, fontWeight: '700', color: '#434654',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
          }}>
            OBRA
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => setObraMenuOpen(v => !v)}
              activeOpacity={0.7}
              style={{
                flex: 1,
                backgroundColor: '#e7e8ea', borderRadius: 8,
                paddingHorizontal: 14, paddingVertical: 12,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                borderBottomWidth: 2, borderBottomColor: '#003d9b',
              }}
            >
              <Text style={{ fontSize: 14, color: '#191c1e', fontWeight: '600', flex: 1 }} numberOfLines={1}>
                {activaObra?.nombre ?? 'Selecciona una obra'}
              </Text>
              <MaterialIcons
                name={obraMenuOpen ? 'expand-less' : 'expand-more'}
                size={20} color="#737685"
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openCreateModal}
              activeOpacity={0.7}
              style={{
                backgroundColor: '#003d9b', borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 12,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MaterialIcons name="add" size={20} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openRenameModal}
              activeOpacity={0.7}
              disabled={!activaObra}
              style={{
                backgroundColor: activaObra ? '#f0f1f3' : '#f8f9fb', borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 12,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MaterialIcons name="edit" size={18} color={activaObra ? '#003d9b' : '#c3c6d6'} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDelete}
              activeOpacity={0.7}
              disabled={!activaObra || obras.length <= 1}
              style={{
                backgroundColor: obras.length > 1 ? '#fdecec' : '#f8f9fb', borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 12,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MaterialIcons
                name="delete-outline" size={18}
                color={obras.length > 1 ? '#ba1a1a' : '#c3c6d6'}
              />
            </TouchableOpacity>
          </View>

          {/* Dropdown de obras (inline, no modal) */}
          {obraMenuOpen && (
            <View style={{
              backgroundColor: '#f8f9fb', borderRadius: 8,
              borderWidth: 1, borderColor: '#e1e2e4',
              marginBottom: 12, overflow: 'hidden',
            }}>
              {obras.length === 0 ? (
                <View style={{ padding: 12 }}>
                  <Text style={{ fontSize: 12, color: '#737685' }}>No hay obras. Agrega una con el boton +.</Text>
                </View>
              ) : (
                obras.map((o, idx) => (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => handleSelectObra(o.id)}
                    activeOpacity={0.7}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 10,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      borderBottomWidth: idx === obras.length - 1 ? 0 : 1,
                      borderBottomColor: '#e1e2e4',
                      backgroundColor: o.id === activaId ? '#e8f0fe' : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 13, color: '#191c1e', fontWeight: '600', flex: 1 }} numberOfLines={1}>
                      {o.nombre}
                    </Text>
                    {o.id === activaId && (
                      <MaterialIcons name="check" size={18} color="#003d9b" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Campos de responsables (por obra) */}
          <View style={{ height: 1, backgroundColor: '#e1e2e4', marginBottom: 14 }} />
          <Text style={{
            fontSize: 10, fontWeight: '700', color: '#737685',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
          }}>
            Responsables (opcional — se usan en el PDF)
          </Text>

          <RefField
            label="REALIZA"
            defaultValue={initialRealiza}
            onChangeText={(v: string) => { realizaRef.current = v; }}
            placeholder="Nombre de quien realiza"
          />
          <RefField
            label="REVISA"
            defaultValue={initialRevisa}
            onChangeText={(v: string) => { revisaRef.current = v; }}
            placeholder="Nombre de quien revisa"
          />
          <RefField
            label="AUTORIZA"
            defaultValue={initialAutoriza}
            onChangeText={(v: string) => { autorizaRef.current = v; }}
            placeholder="Nombre de quien autoriza"
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
              // clearSessionState lee userId ANTES de borrar la clave base y
              // limpia también las claves prefijadas de suscripción/trial,
              // de modo que el siguiente login no quede bloqueado por un
              // "trial consumido" residual de la sesión anterior.
              try {
                await clearSessionState();
              } catch (e) {
                if (__DEV__) console.warn('[Ajustes] clearSessionState error:', e);
              }
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

      {/* Modal: crear / renombrar obra */}
      <Modal
        transparent
        animationType="fade"
        visible={modalMode !== null}
        onRequestClose={closeModal}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center', paddingHorizontal: 24,
        }}>
          <View style={{
            backgroundColor: '#ffffff', borderRadius: 14, padding: 20,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#191c1e', marginBottom: 14 }}>
              {modalMode === 'create' ? 'Nueva obra' : 'Renombrar obra'}
            </Text>
            <TextInput
              value={modalInput}
              onChangeText={setModalInput}
              placeholder="Nombre de la obra"
              placeholderTextColor="#c3c6d6"
              autoFocus
              autoCapitalize="characters"
              style={{
                backgroundColor: '#e7e8ea', borderRadius: 8,
                paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 14, color: '#191c1e',
                borderBottomWidth: 2, borderBottomColor: '#003d9b',
                marginBottom: 18,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                onPress={closeModal}
                style={{ paddingHorizontal: 14, paddingVertical: 10 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 14, color: '#737685', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleModalConfirm}
                activeOpacity={0.85}
                style={{
                  backgroundColor: '#003d9b', borderRadius: 8,
                  paddingHorizontal: 16, paddingVertical: 10,
                }}
              >
                <Text style={{ fontSize: 14, color: '#ffffff', fontWeight: '700' }}>
                  {modalMode === 'create' ? 'Crear' : 'Guardar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
