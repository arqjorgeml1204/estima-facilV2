# Wave 1 — Fix SQLite NativeStatement, Auth Recovery & Security Hardening

Fecha: 2026-04-26
Branch destino: `wave1-fix-sqlite-auth-recovery-security`
Owner: Senior PM + 4 subagentes (A diag SQLite, B diag logout, C recovery design, D security audit)

## Plan inicial (chequeable)

- [x] Recon del repo (MEMORY.md, commit base 991d723, archivos clave)
- [x] Agent A — Diagnóstico SQLite "call to function NativeStatement" (Bugs 1 y 2)
- [x] Agent B — Diagnóstico logout rompiendo login/signup (Bug 3)
- [x] Agent C — Diseño flujo "Olvidaste tu contraseña" (Bug 4)
- [x] Agent D — Auditoría de seguridad (V1…V12)
- [x] Fix Bug 1 + Bug 2: defensive query pattern en `db/database.ts`
  - [x] `await initDatabase()` en cada función pública
  - [x] `Number()` cast a binds INTEGER + validación finite/positive
  - [x] `Number(lastInsertRowId)` cast (bigint → number) en INSERT
  - [x] Patch `setProyectoObra`, `deleteProyecto`, `getProyectoById`,
        `getConceptosByProyecto`, `getEstimacionesByProyecto`,
        `getEstimacionById`, `getDetallesByEstimacion`,
        `getCantidadesAnteriores`, `getProyectos`,
        `getTotalEstimadoPorProyecto`, `getUsuarioByUserId`,
        `crearEstimacion`, `insertEvidencia`, `insertCroquis`
  - [x] `app/estimacion/[id].tsx`: cast `est.proyecto_id` con validación
  - [x] `app/(tabs)/index.tsx`: guard anti-race entre useEffect[] y useFocusEffect
- [x] Fix Bug 3: logout limpia claves prefijadas por userId
  - [x] `utils/auth.ts`: `clearSessionState()` + `buildPerUserSessionKeys()`
  - [x] `app/(tabs)/ajustes.tsx`: usar `clearSessionState()` en logout
- [x] Fix Bug 4: pantalla `recuperar.tsx` + `resetPasswordByEmail`
  - [x] Nueva función `updateUserPassword(userId, hash, salt)` en `db/database.ts`
  - [x] `utils/auth.ts`: `findUserByEmail`, `resetPasswordByEmail`, `isValidEmail`
  - [x] Wire `app/(auth)/login.tsx`: botón → `router.push('/(auth)/recuperar')`
  - [x] Crear `app/(auth)/recuperar.tsx` (2-step flow: email → password → success + auto-login)
- [x] Security hardening
  - [x] V1 — Supabase URL/anon-key en env (fallback al valor histórico) — `utils/auth.ts`
  - [x] V2/V4 — Telegram bot + REVOKE_SECRET en env — `utils/notifyCanjeo.ts`, `utils/supportContact.ts`
  - [x] V3 — `injectJavaScript` hardening (validación base64, escape U+2028/2029) — `services/pdfExtractor/PdfWebViewBridge.tsx`
  - [x] V5/V11 — `console.*` envueltos en `__DEV__` — `utils/auth.ts`, `utils/dataSync.ts`, `utils/emailjs.ts`
  - [x] V7 — Sanitización de URI antes de FileSystem — `app/evidencia/[id].tsx`, `app/croquis/[id].tsx`
  - [x] V12 — Email regex reforzado (TLD ≥ 2) — `utils/auth.ts`
  - [ ] V8 — Migración SHA-256 → bcrypt/argon2id (deuda técnica, NO bloquea)
  - [ ] V6 — Rate-limit local en login (deuda técnica, NO bloquea)
- [x] Crear rama `wave1-fix-sqlite-auth-recovery-security` y commit local (commit `a645dc8`)
- [ ] Push a GitHub (BLOQUEADO en sandbox sin credenciales — ver `push-wave1.bat` en raíz)
- [ ] Build APK release local (BLOQUEADO en sandbox sin Android SDK)
- [ ] Instalar APK en device KKX250521023261 vía ADB
- [ ] QA en device: smoke test 4 bugs

## Review (post-build)

> Esta sección se completará tras build + QA + push.

### Cambios netos

- `db/database.ts` — patrón defensivo en queries + `updateUserPassword`
- `utils/auth.ts` — `clearSessionState`, `findUserByEmail`, `resetPasswordByEmail`,
  EMAIL_REGEX endurecido, env vars Supabase, `__DEV__` logs
- `utils/notifyCanjeo.ts`, `utils/supportContact.ts` — secretos a env vars
- `utils/dataSync.ts`, `utils/emailjs.ts` — `__DEV__` logs
- `services/pdfExtractor/PdfWebViewBridge.tsx` — validación base64 + escape Unicode
- `app/evidencia/[id].tsx`, `app/croquis/[id].tsx` — sanity-check URI
- `app/(auth)/recuperar.tsx` — NUEVO (2-step recovery con auto-login)
- `app/(auth)/login.tsx` — wire botón "Olvidaste tu contraseña"
- `app/(tabs)/ajustes.tsx` — logout usa `clearSessionState()`
- `app/(tabs)/index.tsx` — guard anti-race + cast Number
- `app/estimacion/[id].tsx` — cast Number en `est.proyecto_id`

### Resultado esperado

- Bug 1: grid de estimaciones abre sin "NativeStatement"
- Bug 2: borrar proyecto sin "NativeStatement"
- Bug 3: logout → login con misma cuenta funciona limpio
- Bug 4: "Olvidaste tu contraseña" → flujo email → password → auto-login

### Branch / Commit

- RAMA_LOCAL_CREADA: `wave1-fix-sqlite-auth-recovery-security`
- COMMIT_HASH (local): `a645dc8`
- COMMIT_MSG: `feat(wave1): fix SQLite NativeStatement, logout state cleanup, password recovery, security hardening`
- ESTADO_PUSH: **BLOQUEADO** — la sandbox bash no tiene credenciales de GitHub (`Authentication failed for 'https://github.com/arqjorgeml1204/estima-facilV2.git/'`).
- ACCION_REQUERIDA: ejecutar `push-wave1.bat` (PowerShell o doble-clic) en la raíz del repo. El commit ya está en `.git` local; solo falta el `git push`.
- URL_ESPERADA: https://github.com/arqjorgeml1204/estima-facilV2/tree/wave1-fix-sqlite-auth-recovery-security
