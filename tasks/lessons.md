# Lessons (EstimaFácil V2 — Wave 1)

Patrones aprendidos durante esta wave para evitar repetir los mismos errores en
las siguientes. Revisar al inicio de cada nueva sesión.

## L1 — expo-sqlite SDK 16 + Hermes: bind discipline

**Síntoma:** `Error al cargar (call to function NativeStatement)` intermitente
al abrir/borrar entidades.

**Raíz:**
1. `runAsync` / `getAllAsync` / `getFirstAsync` con un bind `undefined` o `NaN`
   o `bigint` → `prepareAsync` falla en el bridge nativo.
2. `lastInsertRowId` ahora retorna `bigint`, no `number`. Pasarlo crudo a otra
   query lo bindeará como `bigint` y volverá a fallar.
3. Llamar a `db.runAsync()` antes de que `initDatabase()` haya resuelto.
4. Race: dos `loadX()` concurrentes (típico: `useEffect[]` + `useFocusEffect`
   en el primer render) compiten por `prepareAsync`.

**Regla a seguir SIEMPRE en cada función pública de `db/database.ts`:**

```ts
export async function getX(id: number | string) {
  await initDatabase();                               // 1. handle listo
  const idSafe = Number(id);                          // 2. coerce
  if (!Number.isFinite(idSafe) || idSafe <= 0) {      // 3. validate
    return null;                                       //    early-return seguro
  }
  const r = await getDb().getFirstAsync<...>(
    'SELECT ... WHERE id = ?',
    [idSafe],                                          // 4. bind seguro
  );
  return r;
}
```

Para INSERT:
```ts
const result = await getDb().runAsync('INSERT ...', [...]);
return Number(result.lastInsertRowId);                // 5. cast bigint → number
```

Para race-prevention en pantallas con `useEffect[]` + `useFocusEffect`:
```ts
const initialMountDoneRef = useRef(false);
const loadingRef = useRef(false);

useEffect(() => { (async () => { ...; initialMountDoneRef.current = true; })(); }, []);
useFocusEffect(useCallback(() => {
  (async () => {
    if (!initialMountDoneRef.current) return;        // skip first render
    if (loadingRef.current) return;                  // serialize
    loadingRef.current = true;
    try { await load(); } finally { loadingRef.current = false; }
  })();
}, []));
```

## L2 — AsyncStorage keys prefijadas por usuario

**Síntoma:** logout + login con la misma cuenta deja el access-gate mintiendo
("trial consumido", "código activo" del usuario anterior).

**Raíz:** suscripción/trial se guardan con prefijo `@estimafacil:sub_*:${userId}`.
Si el logout solo limpia las claves base, las prefijadas sobreviven y bloquean
al siguiente login (incluso del mismo usuario).

**Regla:**
- Mantener `SESSION_BASE_KEYS` (lista canónica) y `buildPerUserSessionKeys(uid)`
  (lista derivada) en `utils/auth.ts`. Si se agrega una nueva clave de sesión o
  suscripción, REGISTRARLA en una de las dos listas inmediatamente.
- `clearSessionState()` debe leer `userId` ANTES de borrar la clave base; si lo
  borra primero, `buildPerUserSessionKeys(undefined)` devuelve `[]` y no limpia
  las prefijadas.

## L3 — Hermes regex restrictions

Hermes en RN no soporta:
- Lookahead / lookbehind (`(?=`, `(?<=`, `(?!`, `(?<!`)
- Named capture groups (`(?<name>...)`)
- Algunas Unicode property escapes

**Regla:** todo regex en código que corra en RN debe ser ASCII-friendly y sin
lookahead. Si se necesita validación compleja, hacer dos pasadas con regex
simples + lógica JS.

Ejemplo email seguro: `/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i`

## L4 — Secretos en process.env (con fallback temporal)

**Síntoma:** tokens de Telegram / Supabase / Edge Functions hardcoded en bundle.
Cualquiera con acceso al APK puede extraerlos.

**Regla:**
- Leer SIEMPRE de `process.env.EXPO_PUBLIC_*` primero, fallback al valor histórico
  en segundo lugar (para no romper builds durante la migración).
- Cuando el pipeline EAS esté inyectando las variables, ROTAR los secretos y
  ELIMINAR los fallbacks en otro PR.
- `process.env.EXPO_PUBLIC_*` es público en el bundle — sigue siendo un canal de
  rotación, no un secret store. Para verdaderos secretos, usar el server-side
  (Edge Function con env var del backend).

## L5 — `__DEV__` wrapping de console

**Regla:** TODO `console.log/warn/error` que pueda ejecutar en producción debe
estar envuelto:
```ts
if (__DEV__) console.warn('[MOD] ...');
```
En release builds, `__DEV__ === false` y el statement queda como dead code que
el compilador puede eliminar. Esto evita filtrado de info sensible (URLs,
status codes, mensajes con PII) por logcat.

## L6 — `injectJavaScript` en WebView: doble JSON.stringify + escape Unicode

**Síntoma:** payloads inyectados pueden romper el contexto JS si contienen
U+2028 o U+2029 (line separators que el parser JS interpreta literalmente).

**Regla:**
```ts
const safeLiteral = JSON.stringify(jsonString)
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');
webview.injectJavaScript(`window.dispatchEvent(new MessageEvent('message', { data: ${safeLiteral} })); true;`);
```
Y validar SHAPE del payload antes de inyectar (en este repo: regex de base64
estricto antes de pasar PDFs al bridge).

## L7 — File path sanitization antes de FileSystem

**Regla:** antes de `getInfoAsync`/`readAsStringAsync`/`copyAsync`, validar que
el URI es seguro:
```ts
const isSafeFsUri = (u: string) =>
  typeof u === 'string' && u.length > 0 &&
  u.indexOf('..') === -1 &&
  /^(file|content|ph|asset):\/\//i.test(u);
```

## L8 — Deuda técnica conocida (NO bloquea esta wave)

- **V8** — SHA-256 con salt es rápido para crackeo offline. Migrar a
  `bcrypt`/`argon2id` (vía `expo-secure-store` o WebView+wasm) en próximo wave.
  Hoy no hay backend que limite tasa → riesgo medio dado que la base remota es
  Supabase con RLS, pero documentar.
- **V6** — Falta rate-limit local en login (3 intentos / 30s) para defensa en
  profundidad contra fuerza bruta offline.
- **V8b** — Considerar pepper rotativo además del salt.

## L9 — Reglas de entrega del PM (recordatorio)

**OBLIGATORIO** antes de reportar DONE:
1. Crear branch con nombre descriptivo (`wave1-...`).
2. `git add` SOLO archivos del scope (no committear basura del root).
3. `git commit -m "feat(wave1): ..."`
4. `git push origin <branch>` y verificar éxito.
5. Reportar `RAMA_PUSHEADA`, `COMMIT_HASH`, `URL` de GitHub.

Si push falla → reportar error exacto. NUNCA reportar DONE sin push confirmado.
