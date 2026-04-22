/**
 * utils/obras.ts
 *
 * Helpers para gestionar multiples obras (perfiles) en EstimaFacil V2.
 *
 * Modelo:
 *   @estimafacil:obras            -> JSON array: Obra[]
 *   @estimafacil:obra_activa_id   -> string id de la obra activa
 *
 * Backward-compat:
 *   Antes habia una unica obra guardada en la key legacy 'obra' (y 'frente').
 *   migrateLegacyObra() detecta esa clave, crea la primera obra con ese
 *   nombre y la marca como activa. Esto corre al primer mount de Ajustes.
 *
 * Reglas Hermes-safe:
 *   - No usa regex con lookahead/lookbehind/named groups.
 *   - No usa flags exoticas de regex.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Obra {
  id: string;
  nombre: string;
  realiza?: string;
  revisa?: string;
  autoriza?: string;
  /**
   * @deprecated Mantenido solo por backward-compat. No usar en UI ni en PDF.
   * Algunas obras migradas desde la estructura legacy pueden traer este campo.
   */
  frente?: string;
}

// ── Keys de AsyncStorage ──────────────────────────────────────────────────────

export const STORAGE_KEY_OBRAS = '@estimafacil:obras';
export const STORAGE_KEY_OBRA_ACTIVA = '@estimafacil:obra_activa_id';

// Keys legacy (solo lectura para migracion)
const LEGACY_KEY_OBRA = 'obra';
const LEGACY_KEY_FRENTE = 'frente';

// ── Helpers internos ──────────────────────────────────────────────────────────

const DEFAULT_OBRA_NOMBRE = 'VISTAS DEL NEVADO';

/**
 * Genera un id unico para una obra nueva.
 * Usa timestamp + random. No dependemos de uuid (evita nuevas deps).
 */
function newObraId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.floor(Math.random() * 1e6).toString(36);
  return 'obra_' + ts + '_' + rnd;
}

function safeParseObras(raw: string | null): Obra[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filtrar entradas invalidas y normalizar campos
    const out: Obra[] = [];
    for (const item of parsed) {
      if (item && typeof item === 'object' && typeof item.id === 'string' && typeof item.nombre === 'string') {
        out.push({
          id: item.id,
          nombre: item.nombre,
          realiza: typeof item.realiza === 'string' ? item.realiza : '',
          revisa: typeof item.revisa === 'string' ? item.revisa : '',
          autoriza: typeof item.autoriza === 'string' ? item.autoriza : '',
          frente: typeof item.frente === 'string' ? item.frente : undefined,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function writeObras(list: Obra[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_OBRAS, JSON.stringify(list));
}

// ── API publica ───────────────────────────────────────────────────────────────

/**
 * Devuelve la lista de obras persistidas. Si no hay nada -> [].
 * No ejecuta migracion aqui (hazlo en el mount con migrateLegacyObra).
 */
export async function getObras(): Promise<Obra[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_OBRAS);
  return safeParseObras(raw);
}

/**
 * Obra activa (la seleccionada por el usuario). Si el id guardado no existe
 * en la lista, devuelve la primera obra disponible. Si no hay ninguna, null.
 */
export async function getObraActiva(): Promise<Obra | null> {
  const obras = await getObras();
  if (obras.length === 0) return null;
  const activaId = await AsyncStorage.getItem(STORAGE_KEY_OBRA_ACTIVA);
  if (activaId) {
    const found = obras.find(o => o.id === activaId);
    if (found) return found;
  }
  // Fallback: primera obra + persistir como activa
  await AsyncStorage.setItem(STORAGE_KEY_OBRA_ACTIVA, obras[0].id);
  return obras[0];
}

/**
 * Cambia la obra activa. No valida que exista (el caller debe asegurarlo).
 */
export async function setObraActiva(id: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_OBRA_ACTIVA, id);
}

/**
 * Crea (si no existe) o actualiza una obra por id.
 * Si la obra no trae id, se le asigna uno nuevo.
 * Retorna la obra final (con id garantizado).
 */
export async function upsertObra(obra: Obra): Promise<Obra> {
  const obras = await getObras();
  const normalized: Obra = {
    id: obra.id && obra.id.length > 0 ? obra.id : newObraId(),
    nombre: (obra.nombre ?? '').trim() || DEFAULT_OBRA_NOMBRE,
    realiza: obra.realiza ?? '',
    revisa: obra.revisa ?? '',
    autoriza: obra.autoriza ?? '',
    frente: obra.frente,
  };
  const idx = obras.findIndex(o => o.id === normalized.id);
  if (idx >= 0) {
    obras[idx] = normalized;
  } else {
    obras.push(normalized);
  }
  await writeObras(obras);
  return normalized;
}

/**
 * Borra una obra. Guard: no permite borrar la ultima obra (para evitar
 * quedar sin obra activa y romper PDFs).
 * Si la obra borrada era la activa, promueve la primera de las restantes.
 */
export async function deleteObra(id: string): Promise<void> {
  const obras = await getObras();
  if (obras.length <= 1) {
    throw new Error('No puedes eliminar la unica obra. Crea otra antes.');
  }
  const next = obras.filter(o => o.id !== id);
  await writeObras(next);
  const activaId = await AsyncStorage.getItem(STORAGE_KEY_OBRA_ACTIVA);
  if (activaId === id) {
    await AsyncStorage.setItem(STORAGE_KEY_OBRA_ACTIVA, next[0].id);
  }
}

/**
 * Crea una nueva obra vacia con el nombre dado. Si es la primera obra,
 * la deja como activa automaticamente. Retorna la obra creada.
 */
export async function createObra(nombre: string): Promise<Obra> {
  const trimmed = (nombre ?? '').trim();
  const obra: Obra = {
    id: newObraId(),
    nombre: trimmed.length > 0 ? trimmed : 'OBRA NUEVA',
    realiza: '',
    revisa: '',
    autoriza: '',
  };
  const obras = await getObras();
  obras.push(obra);
  await writeObras(obras);
  if (obras.length === 1) {
    await AsyncStorage.setItem(STORAGE_KEY_OBRA_ACTIVA, obra.id);
  }
  return obra;
}

// ── Color helper (badges por obra) ────────────────────────────────────────────

/**
 * Paleta fija (10 colores) con contraste AA sobre texto blanco.
 * Orden intencional: variada tonalmente para que obras consecutivas en orden
 * de creacion reciban colores visualmente distintos.
 */
const OBRA_PALETTE: string[] = [
  '#2E7D32', // verde bosque
  '#1565C0', // azul profundo
  '#C62828', // rojo ladrillo
  '#6A1B9A', // violeta
  '#EF6C00', // naranja intenso
  '#00838F', // cyan oscuro
  '#AD1457', // magenta
  '#4E342E', // cafe
  '#283593', // indigo
  '#558B2F', // oliva
];

const OBRA_COLOR_FALLBACK = '#9E9E9E'; // gris neutro (sin obra / eliminada)

/**
 * Retorna un color hex determinista a partir del id de una obra.
 * - null / undefined / '' -> fallback gris.
 * - Hash sumado ponderado -> index en OBRA_PALETTE.
 *
 * Hermes-safe: sin regex, solo aritmetica basica.
 */
export function getObraColorById(id: string | null | undefined): string {
  if (!id || id.length === 0) return OBRA_COLOR_FALLBACK;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash + id.charCodeAt(i) * (i + 1)) | 0;
  }
  const idx = Math.abs(hash) % OBRA_PALETTE.length;
  return OBRA_PALETTE[idx];
}

/**
 * Color fallback para proyectos legacy sin obra_id o cuya obra fue eliminada.
 * Expuesto por si alguna UI lo necesita explicitamente.
 */
export function getObraColorFallback(): string {
  return OBRA_COLOR_FALLBACK;
}

/**
 * Migracion legacy -> nuevo modelo.
 *
 * Reglas:
 *   - Si ya hay obras en @estimafacil:obras -> no hace nada (idempotente).
 *   - Si hay una 'obra' legacy en AsyncStorage -> crea la primera obra con
 *     ese nombre; preserva 'frente' legacy como campo deprecated.
 *   - Si no hay ninguna -> crea la obra default 'VISTAS DEL NEVADO'.
 *   - No borra las keys legacy (para no romper pantallas que aun las leen
 *     mientras se termina el refactor).
 */
export async function migrateLegacyObra(): Promise<void> {
  const existing = await getObras();
  if (existing.length > 0) return;

  const legacyObra = await AsyncStorage.getItem(LEGACY_KEY_OBRA);
  const legacyFrente = await AsyncStorage.getItem(LEGACY_KEY_FRENTE);

  const nombre = (legacyObra && legacyObra.trim().length > 0)
    ? legacyObra.trim()
    : DEFAULT_OBRA_NOMBRE;

  const obra: Obra = {
    id: newObraId(),
    nombre,
    realiza: '',
    revisa: '',
    autoriza: '',
    frente: legacyFrente ?? undefined,
  };

  await writeObras([obra]);
  await AsyncStorage.setItem(STORAGE_KEY_OBRA_ACTIVA, obra.id);
}
