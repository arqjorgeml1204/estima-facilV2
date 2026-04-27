# Wave 1 — Reporte de sesión (handoff a Claude Code)

**Fecha:** 2026-04-28
**Repo:** `C:\CLAUDE CODE\AGENCY AGENTS\estima-facilV2`
**Branch:** `wave1-fix-sqlite-auth-recovery-security`
**Commit pusheado:** `a645dc8f6f298966770604d3a68aceca14587920`
**URL:** https://github.com/arqjorgeml1204/estima-facilV2/tree/wave1-fix-sqlite-auth-recovery-security
**Estado:** PUSH OK pero el commit contiene 10 archivos TRUNCADOS — necesita amend + force-push antes de buildear.

---

## 1. Resumen ejecutivo

- 4 bugs lógicos resueltos en código (SQLite NativeStatement x2, logout, recuperar contraseña).
- 8 hallazgos de seguridad parchados (V1, V2, V3, V4, V5, V7, V11, V12). V6 y V8 quedan como deuda técnica explícita.
- Commit creado, push verificado en GitHub.
- DESCUBIERTO AL FINAL: el tool `Edit` del agente truncó 10 archivos sin avisar; el commit pusheado está roto a nivel de parseo (Metro/tsc fallarán). Reparación detallada en sección 6.

---

## 2. Trabajo de los 4 sub-agentes

### Agent A — Diagnóstico SQLite "call to function NativeStatement"
Identificó dos causas:
1. `expo-sqlite@16` retorna `lastInsertRowId` como `bigint`; al pasarlo a queries posteriores (binds INTEGER) Hermes lo rechaza y rompe el statement.
2. Race condition entre `useEffect([])` y `useFocusEffect()` en `app/(tabs)/index.tsx`: ambos disparaban `loadProyectos()` antes de que `initDatabase()` terminara, golpeando un statement que se cerraba en paralelo.

### Agent B — Diagnóstico logout rompe login/signup
Detectó que `app/(tabs)/ajustes.tsx` solo borraba claves globales en `AsyncStorage.multiRemove(...)`, dejando huérfanas las claves prefijadas por userId (`@estimafacil:sub_*:${userId}`, `@estimafacil:trial_*:${userId}`). En el siguiente login la app leía un "trial consumido" residual y bloqueaba al usuario.

### Agent C — Diseño "Olvidaste tu contraseña"
Definió flujo de 2 pasos local-only (sin backend de email):
1. Usuario ingresa email registrado.
2. Si existe en SQLite → captura nueva contraseña → hash SHA-256 + salt → `UPDATE usuarios SET password_hash, salt WHERE user_id` → auto-login.

### Agent D — Auditoría de seguridad (12 hallazgos)
Clasificó por severidad. Wave 1 atacó V1, V2, V3, V4, V5, V7, V11, V12. V6 (rate-limit local) y V8 (migrar SHA-256 a bcrypt/argon2id) quedan como deuda técnica documentada en `tasks/lessons.md`.

---

## 3. Carpeta donde se localizan los archivos modificados

Todo vive en la raíz del repo: `C:\CLAUDE CODE\AGENCY AGENTS\estima-facilV2\`

Sub-rutas tocadas:
- `db/`
- `utils/`
- `services/pdfExtractor/`
- `app/(auth)/`
- `app/(tabs)/`
- `app/croquis/`
- `app/estimacion/`
- `app/evidencia/`
- `tasks/` (documentación añadida)
- raíz del repo (script `push-wave1.bat`)

---

## 4. Archivos que SIRVEN (íntegros, listos para producción)

Verificados con `wc -l` + `tsc --noEmit` + lectura visual del fin de archivo.

| Archivo | Bytes | Líneas | Función |
|---|---|---|---|
| `db/database.ts` | 35,294 | 869 | Patrón defensivo en queries + `updateUserPassword` |
| `utils/auth.ts` | ~10 KB | 281 | `clearSessionState`, `findUserByEmail`, `resetPasswordByEmail`, EMAIL_REGEX endurecido, env vars Supabase |
| `app/(auth)/recuperar.tsx` | 12,912 | 337 | NUEVO: pantalla 2-step recovery con auto-login |
| `app/(auth)/login.tsx` | ~14 KB | 409 | Wire del botón "Olvidaste tu contraseña" → `router.push('/(auth)/recuperar')` |
| `tasks/todo.md` | — | 78 | Plan Wave 1 con checkboxes |
| `tasks/lessons.md` | — | 159 | 9 lecciones aprendidas |
| `push-wave1.bat` | — | — | Helper que ya usaste con éxito |

---

## 5. Archivos que DEBEN MODIFICARSE (truncados en el commit pusheado)

El tool `Edit` aplicó las modificaciones intencionadas pero cortó el final del archivo. El commit tiene los cambios CORRECTOS de la cabecera/cuerpo, pero el archivo termina a mitad de línea/JSX, perdiendo el cierre.

| Archivo | En commit | Real | Faltan | Naturaleza del corte |
|---|---|---|---|---|
| `utils/supportContact.ts` | 82 L | 94 L | 12 L | Pierde función `openWhatsAppSupport` entera |
| `utils/notifyCanjeo.ts` | 76 L | 100 L | 24 L | Pierde función `notifyRevocacion` entera |
| `utils/emailjs.ts` | 70 L | 73 L | 3 L | Cierre de objeto + `}` final |
| `utils/dataSync.ts` | 293 L | 297 L | 4 L | Cierre de función + `}` final |
| `services/pdfExtractor/PdfWebViewBridge.tsx` | 245 L | 248 L+ | 3 L+ | Cuerpo del handler + StyleSheet |
| `app/(tabs)/ajustes.tsx` | 652 L | 663 L | 11 L | Cierre Modal/SafeAreaView |
| `app/(tabs)/index.tsx` | 690 L | 731 L | 41 L | Cierre Modal/Pressable/SafeAreaView |
| `app/croquis/[id].tsx` | 433 L | 445 L | 12 L | Cierre Modal/SafeAreaView |
| `app/estimacion/[id].tsx` | 1560 L | 1571 L | 11 L | Cierre `<InputModal ...>` + SafeAreaView |
| `app/evidencia/[id].tsx` | 437 L | 443 L | 6 L | Cierre TouchableOpacity/Modal/SafeAreaView |

**Cómo verificar el daño:**
```bash
cd "C:\CLAUDE CODE\AGENCY AGENTS\estima-facilV2"
npx tsc --noEmit --project tsconfig.json
```
Verás errores `TS17008: JSX element 'X' has no corresponding closing tag` y `TS1005: '}' expected` apuntando justo al fin de cada archivo.

**Cómo se reparan (algoritmo):**
Para cada archivo:
1. `git show 991d723:<archivo>` → contenido base completo.
2. `git show HEAD:<archivo>` → contenido con cambios wave1, truncado.
3. Tomar la última línea parcial de HEAD, buscar la última ocurrencia de ese fragmento en BASE, splicear: `HEAD + base[fin_del_fragmento:]`.
4. Verificar `tsc --noEmit` antes de stage.

8 de los 10 se reparan con splice automático. **2 archivos requieren ajuste manual fino** porque el fragmento de truncamiento es genérico (whitespace puro) y el splice cae en el lugar equivocado:
- `app/evidencia/[id].tsx` — corte queda en `style={{` con 10 espacios de indentación.
- `services/pdfExtractor/PdfWebViewBridge.tsx` — corte en `clearTimeout(entry.timer);\n    p` (la `p` inicia `pendingRef.current.delete(...)`).

Para esos dos, leer el diff completo y reconstruir el cuerpo del handler/JSX manualmente desde el base.

---

## 6. Hallazgos de seguridad — estado por hallazgo

| ID | Cambio | Estado |
|---|---|---|
| V1 | Supabase URL/anon-key vía `process.env.EXPO_PUBLIC_*` con fallback histórico — `utils/auth.ts` | OK (archivo íntegro) |
| V2 | Telegram bot token vía env — `utils/notifyCanjeo.ts`, `utils/supportContact.ts` | Cambios aplicados pero archivos truncados |
| V3 | `injectJavaScript` con validación base64 + escape U+2028/U+2029 — `services/pdfExtractor/PdfWebViewBridge.tsx` | Cambios aplicados pero archivo truncado |
| V4 | REVOKE_SECRET + REVOKE_ENDPOINT vía env — `utils/notifyCanjeo.ts` | Cambios aplicados pero archivo truncado |
| V5 | `console.*` envueltos en `__DEV__` — `utils/auth.ts`, `utils/dataSync.ts`, `utils/emailjs.ts` | OK en `auth.ts`, archivos truncados en los otros dos |
| V6 | Rate-limit local en login | Diferido — deuda técnica |
| V7 | Sanitización de URI antes de FileSystem — `app/evidencia/[id].tsx`, `app/croquis/[id].tsx` | Cambios aplicados pero archivos truncados |
| V8 | Migrar SHA-256 → bcrypt/argon2id | Diferido — deuda técnica |
| V11 | Logs sin secretos | OK |
| V12 | Email regex con TLD ≥ 2 — `utils/auth.ts` | OK |

Después de reparar las 10 truncaciones, todos los V aplicados quedan funcionales.

---

## 7. Qué se necesita para terminar (push + build con Metro)

### Paso A — Reparar truncaciones (obligatorio)

Desde la raíz del repo en Git Bash o PowerShell:

```bash
# 1) Generar reconstrucciones en /tmp
mkdir -p /tmp/wave1fix
python - <<'PY'
import subprocess, os
FILES = [
  'app/(tabs)/ajustes.tsx', 'app/(tabs)/index.tsx',
  'app/croquis/[id].tsx', 'app/estimacion/[id].tsx',
  'app/evidencia/[id].tsx',
  'services/pdfExtractor/PdfWebViewBridge.tsx',
  'utils/dataSync.ts', 'utils/emailjs.ts',
  'utils/notifyCanjeo.ts', 'utils/supportContact.ts',
]
def show(rev, p):
    return subprocess.check_output(['git','show', f'{rev}:{p}']).decode('utf-8','replace')
os.makedirs('/tmp/wave1fix', exist_ok=True)
for f in FILES:
    base, head = show('991d723', f), show('HEAD', f)
    if head.endswith('\n'):
        print('SKIP (no truncation)', f); continue
    partial = head.rsplit('\n', 1)[-1]
    idx = base.rfind(partial)
    if idx < 0:
        print('NEEDS_MANUAL', f); continue
    out = head + base[idx + len(partial):]
    safe = f.replace('/','__').replace('[','_').replace(']','_').replace('(','_').replace(')','_')
    with open(f'/tmp/wave1fix/{safe}','w', encoding='utf-8') as o: o.write(out)
    print('OK', f, '->', len(out), 'bytes,', out.count('\n'), 'lines')
PY

# 2) Copiar reconstrucciones al worktree
python - <<'PY'
import shutil
PAIRS = [
 ('app___tabs___ajustes.tsx','app/(tabs)/ajustes.tsx'),
 ('app___tabs___index.tsx','app/(tabs)/index.tsx'),
 ('app__croquis___id_.tsx','app/croquis/[id].tsx'),
 ('app__estimacion___id_.tsx','app/estimacion/[id].tsx'),
 ('app__evidencia___id_.tsx','app/evidencia/[id].tsx'),
 ('services__pdfExtractor__PdfWebViewBridge.tsx','services/pdfExtractor/PdfWebViewBridge.tsx'),
 ('utils__dataSync.ts','utils/dataSync.ts'),
 ('utils__emailjs.ts','utils/emailjs.ts'),
 ('utils__notifyCanjeo.ts','utils/notifyCanjeo.ts'),
 ('utils__supportContact.ts','utils/supportContact.ts'),
]
for src,dst in PAIRS:
    shutil.copy(f'/tmp/wave1fix/{src}', dst)
PY

# 3) Reparar manualmente los 2 archivos que el splice no cierra bien:
#    - app/evidencia/[id].tsx
#    - services/pdfExtractor/PdfWebViewBridge.tsx
#    Comparar git show 991d723:<file> contra el archivo actual y completar
#    el cuerpo perdido del handler/JSX.

# 4) Verificar que parsea limpio
npx tsc --noEmit --project tsconfig.json
# debe terminar sin errores
```

### Paso B — Amend del commit y force-push

```bash
git add db/database.ts utils/auth.ts utils/dataSync.ts utils/emailjs.ts \
        utils/notifyCanjeo.ts utils/supportContact.ts \
        services/pdfExtractor/PdfWebViewBridge.tsx \
        "app/(tabs)/ajustes.tsx" "app/(tabs)/index.tsx" \
        "app/croquis/[id].tsx" "app/estimacion/[id].tsx" \
        "app/evidencia/[id].tsx" \
        "app/(auth)/login.tsx" "app/(auth)/recuperar.tsx" \
        tasks/todo.md tasks/lessons.md tasks/SESION_WAVE1_REPORTE.md

git commit --amend --no-edit
git push --force-with-lease origin wave1-fix-sqlite-auth-recovery-security
```

`--force-with-lease` evita pisar trabajo si alguien más empujó al branch entre medias.

### Paso C — Build local con Metro + Gradle (release APK)

Pre-requisitos en la máquina:
- Node ≥ 20 (`node -v`)
- JDK 17 (Adoptium Temurin recomendado)
- Android SDK + NDK (vía Android Studio o standalone)
- Variables de entorno: `ANDROID_HOME` apuntando al SDK, `JAVA_HOME` a JDK 17
- En `android/local.properties`: `sdk.dir=C:\\Users\\Arqjo\\AppData\\Local\\Android\\Sdk` (o donde esté tu SDK)

Build limpio:

```bash
cd "C:\CLAUDE CODE\AGENCY AGENTS\estima-facilV2"

# Limpiar caches por si Metro tiene basura previa
npm install
npx expo prebuild --no-install --clean

# Compilar APK release
cd android
gradlew.bat clean
gradlew.bat assembleRelease

# El APK queda en:
#   android\app\build\outputs\apk\release\app-release.apk
```

Si quieres firmar con tu keystore custom: configurar `android/gradle.properties` con `MYAPP_UPLOAD_STORE_FILE`, `MYAPP_UPLOAD_KEY_ALIAS`, etc., y `android/app/build.gradle` con `signingConfigs.release`.

Alternativa con Expo (más rápido para dev builds, no para release final):
```bash
npx expo run:android --variant release
```

### Paso D — Instalar en device + QA

```bash
adb devices
# Esperar ver KKX250521023261 listed

adb install -r "android\app\build\outputs\apk\release\app-release.apk"
adb logcat *:E ReactNative:V ReactNativeJS:V | findstr /I "estimafacil error native"
```

Smoke test manual:
1. Abrir grid de estimaciones (Bug 1) — ya no debe aparecer "call to function NativeStatement".
2. Borrar un proyecto (Bug 2) — sin error.
3. Login → Logout → Login con misma cuenta (Bug 3) — entra limpio, sin "trial consumido".
4. Login → "Olvidaste tu contraseña" → ingresa email → nueva contraseña → auto-login (Bug 4).

---

## 8. Causa raíz del incidente de truncación (para no repetirla)

El sandbox Linux del agente lee el repo via bindfs montado sobre virtiofs sobre la carpeta Windows. El tool `Edit` (Windows side) escribió contenido válido en disco, pero la capa de cache devolvió tamaños "esperados" mientras que el contenido leído por bash quedó cortado. `git status` no marcó nada raro porque los cambios intencionales SÍ ocurrieron; el daño viajó pegado al cambio legítimo.

**Defensa para futuras sesiones:**
- Tras cada `Edit` en archivos > 1 KB, verificar `tail -3` desde bash y comparar con un cierre lógico esperado.
- Para archivos críticos, escribir vía Python (`open(f,'w').write(...)`) en lugar de `Edit`.
- Antes de commit, correr `npx tsc --noEmit` o `node -c <archivo>` cuando aplique.

---

## 9. Reglas del PM (no negociables)

- NUNCA reportar DONE sin push confirmado en GitHub.
- Si push falla → crear `.bat` helper en raíz del repo y pedir al usuario que lo ejecute (esta sesión usó `push-wave1.bat` con éxito).
- APK release builds: imposibles dentro del sandbox; preparar `build-apk.bat` o instrucciones claras para Windows.
- Verificar tail/EOF de cualquier archivo editado por el tool `Edit`.

---

## 10. Tabla rápida de comandos

| Tarea | Comando |
|---|---|
| Ver estado del branch | `git log -1 --oneline` |
| Confirmar push | `git ls-remote origin wave1-fix-sqlite-auth-recovery-security` |
| Diff vs base | `git diff 991d723 HEAD --stat` |
| Verificar parseo | `npx tsc --noEmit --project tsconfig.json` |
| Build release | `cd android && gradlew.bat assembleRelease` |
| Instalar APK | `adb install -r android\app\build\outputs\apk\release\app-release.apk` |

---

## 11. Próximas waves sugeridas (fuera de Wave 1)

- **Wave 1.5 (deuda técnica):** V6 rate-limit en login + V8 migrar SHA-256 a bcrypt/argon2id.
- **Wave 2 (funcionalidad):** lo que tengas en backlog tras estos fixes.

---

Sources:
- [Branch wave1-fix-sqlite-auth-recovery-security](https://github.com/arqjorgeml1204/estima-facilV2/tree/wave1-fix-sqlite-auth-recovery-security)
- [Commit a645dc8](https://github.com/arqjorgeml1204/estima-facilV2/commit/a645dc8f6f298966770604d3a68aceca14587920)
