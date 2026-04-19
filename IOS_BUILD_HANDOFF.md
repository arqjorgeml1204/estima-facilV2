# EstimaFácil V2 — iOS Build Handoff (Sesión Nueva)

> **Para pegar al inicio de la nueva sesión.** Carga este archivo, lee la sección "PROMPT INICIAL", ejecuta exactamente lo que dice. Toda la información que necesita el PM está aquí — no debe explorar el repo si no es necesario.

---

## PROMPT INICIAL (copiar/pegar a Claude)

```
INICIAR AGENTE: SENIOR PROJECT MANAGER — iOS BUILD EstimaFácil V2

CONTEXTO COMPLETO: lee C:\CLAUDE CODE\AGENCY AGENTS\estima-facilV2\IOS_BUILD_HANDOFF.md (este archivo).

OBJETIVO ÚNICO DE LA SESIÓN: dejar EstimaFácil V2 instalable en iPhone (mi iPhone personal).

NO HAGAS PREGUNTAS. Carga contexto del .md, ejecuta el plan de fases en paralelo donde sea posible vía sub-agentes (Explore para auditar, general-purpose para edits puntuales). Reporta solo en hitos: (1) auditoría iOS terminada, (2) credenciales/perfil EAS configurados, (3) build disparado, (4) cómo instalar el .ipa en iPhone.

REGLA CRÍTICA: nunca contamines tu contexto PM leyendo archivos grandes. Para cualquier exploración profunda, despacha sub-agente Explore. Para edits, despacha sub-agente general-purpose con instrucción concreta + paths exactos.

ARRANCA YA.
```

---

## ESTADO DEL PROYECTO (lo que ya está hecho)

### Build Android estable
- Última versión Android: APK build `249a09f0-fd4b-455d-b596-3aaab5de247c` (Session 20, commit `95fd6f8`)
- Todas las funcionalidades confirmadas funcionando: grid, PDF, modo actualización, logo JAVER, notificaciones Telegram, admin de códigos
- Telegram Bot `@ESTIMAFACILBOT` operativo (token y chat_id ya hardcoded en `utils/notifyCanjeo.ts`)
- Supabase schema actualizado con `is_revoked` + `revoked_at`

### ⚠️ EL BUILD iOS HEREDARÁ TODO EL CÓDIGO ACTUAL
El proyecto NO tiene código nativo personalizado — es 100% JS/TS sobre Expo modules. Por lo tanto el build iOS desde `master` (commit `95fd6f8`) producirá una app **funcionalmente idéntica al Android actual**, incluyendo:
- Grid arreglado (Rules of Hooks fix Sesión 19)
- Scroll sync + sticky + casa 4 fix + contador vivo (Sesión 20)
- Modo Actualización financiero en Proyectos / PDF / Por Estimar
- Logo JAVER vectorizado en PDF
- Sistema completo de canjeo + admin de códigos
- Notificaciones Telegram operativas (mismo bot, mismo chat_id)
- Auth híbrido SQLite + Supabase
- Extractor PDF JAVER deterministico

**No hay nada que portar manualmente entre Android y iOS.** Solo se agrega el perfil de build iOS en `eas.json` y los permisos `infoPlist` en `app.json`.

### Configuración actual relevante para iOS

**`app.json`** ya tiene `ios.bundleIdentifier`:
```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.estimafacil.app"
}
```

**`eas.json`** NO tiene perfil iOS — solo Android. Hay que agregarlo.

**Plugins iOS-relevantes**:
- `expo-router`, `expo-sqlite`, `expo-document-picker` (con `iCloudContainerEnvironment: "Production"`)
- `expo-crypto` (recientemente agregado)

**Stack**:
- Expo SDK 54 / React Native con Hermes
- newArchEnabled: true
- expo-router file-based
- AsyncStorage + SQLite local + Supabase remoto
- Sin código nativo personalizado — todo es JS/TS sobre Expo modules

---

## OPCIONES DE BUILD iOS — DECISIÓN REQUERIDA

EAS Build para iOS tiene **tres caminos**:

### A. Simulator Build (gratis, rápido, NO sirve en iPhone físico)
- Genera `.app` para correr en Xcode Simulator (Mac únicamente)
- **No aplica** — Arqjo está en Windows, no tiene Mac
- Descartar

### B. Internal Distribution (Ad-hoc) — RECOMENDADO para Arqjo
- Requiere **Apple Developer Program: $99 USD/año**
- Genera `.ipa` instalable directamente en iPhones registrados por UDID (hasta 100/año)
- Sin pasar por App Store ni TestFlight review
- Distribución vía link directo de EAS o instalación con Apple Configurator / AltStore
- EAS maneja certificados y provisioning profile automáticamente
- **Setup**:
  1. Cuenta Apple Developer activa ($99/año)
  2. Registrar UDID del iPhone en developer.apple.com (o vía `eas device:create`)
  3. Perfil EAS `preview-ios` con `distribution: "internal"`

### C. TestFlight (vía App Store Connect)
- Requiere Apple Developer Program: $99 USD/año
- También requiere crear app en App Store Connect, subir .ipa, esperar processing (~10 min)
- Hasta 100 testers internos sin review, 10,000 externos con review (~24h)
- Más burocrático pero más cómodo a largo plazo (testers no necesitan dar UDID)

### **Recomendación PM**: Opción B (Internal Distribution)
Razones:
- Arqjo solo necesita probar él mismo en su iPhone, no distribuir a terceros aún
- Más rápido de configurar (no hay review ni App Store Connect)
- Reusable: cualquier dispositivo registrado puede instalar futuros builds sin re-publicar

**Bloqueo crítico**: Sin cuenta Apple Developer ($99/año) no hay build iOS funcional para iPhone físico. Esto es ineludible — Apple no permite distribución sin firma con un Developer ID.

---

## PLAN DE FASES PARA LA NUEVA SESIÓN

### Fase 0 — Verificar prerrequisitos del usuario (PM pregunta DIRECTO al inicio, una sola vez)
- ¿Tiene cuenta Apple Developer Program activa? (Apple ID + $99/año pagados)
- ¿Tiene el UDID del iPhone? (se obtiene desde Settings > General > About > scroll y tap en serial; o conectado a iTunes/Finder en Mac; o vía https://udid.tech desde Safari del iPhone)
- ¿Aceptaría ir por TestFlight en lugar de Internal Distribution si prefiere comodidad sobre velocidad?

Si NO tiene cuenta Apple Developer: explicar que es bloqueante, dar link `developer.apple.com/programs/enroll` y pausar sesión hasta que se inscriba.

### Fase 1 — Auditoría iOS (sub-agente Explore en paralelo)
Despachar UN sub-agente Explore con esta tarea:
> "Audita el proyecto en `C:\CLAUDE CODE\AGENCY AGENTS\estima-facilV2` para detectar problemas potenciales en build iOS. Busca específicamente: (1) `Platform.OS === 'android'` sin contraparte iOS, (2) imports de módulos Android-only (`PermissionsAndroid`, `ToastAndroid`, etc.), (3) uso de APIs de filesystem que requieren permisos iOS específicos (NSPhotoLibraryUsageDescription, NSCameraUsageDescription, etc.), (4) hardcoded paths con `/storage/emulated/` o similares, (5) URLs HTTP plain (iOS bloquea por ATS — App Transport Security), (6) deep links/scheme conflicts. Reporta findings en formato breve: archivo:línea + descripción del riesgo + sugerencia de fix. NO modifiques código, solo reporta."

### Fase 2 — Configurar `eas.json` con perfil iOS (PM directo, edit puntual)
Agregar al `eas.json`:
```json
"build": {
  "preview": {
    "android": { "buildType": "apk" },
    "ios": {
      "simulator": false,
      "distribution": "internal"
    }
  },
  "production": {
    "android": { "buildType": "app-bundle" },
    "ios": {}
  }
}
```

### Fase 3 — Agregar permisos iOS faltantes en `app.json` (basado en hallazgos Fase 1)
Probable que necesite:
```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.estimafacil.app",
  "buildNumber": "1",
  "infoPlist": {
    "NSDocumentsFolderUsageDescription": "EstimaFácil necesita acceso para guardar PDFs de estimaciones",
    "NSPhotoLibraryAddUsageDescription": "Para guardar PDFs generados",
    "ITSAppUsesNonExemptEncryption": false
  }
}
```
Ajustar según hallazgos reales de la auditoría.

### Fase 4 — Registrar dispositivo + credenciales EAS
Comandos a ejecutar (con confirmación del usuario antes):
```bash
cd "C:\CLAUDE CODE\AGENCY AGENTS\estima-facilV2"
npx eas device:create     # genera link/QR para que el iPhone se registre
npx eas credentials       # configura cert/profile (interactivo, pero puede usar --non-interactive con generación automática)
```

### Fase 5 — Disparar build iOS
```bash
npx eas build --platform ios --profile preview --non-interactive --no-wait
```
Cola free tier: ~30-50 min.

### Fase 6 — Instalación en iPhone
Cuando el build termine, EAS da link tipo `https://expo.dev/artifacts/eas/<id>.ipa`.
Para instalar:
- **Opción A (más fácil)**: abrir el link de "internal distribution" desde Safari del iPhone → tap "Install" → Settings > General > VPN & Device Management → confiar en el perfil.
- **Opción B**: Apple Configurator 2 (Mac) → drag-and-drop el .ipa al iPhone conectado.
- **Opción C**: AltStore o Sideloadly (Windows compatible) si Arqjo no tiene Mac.

---

## ARCHIVOS CLAVE QUE EL PM DEBE CONOCER (sin leerlos completos)

| Archivo | Para qué |
|---------|----------|
| `app.json` | Config Expo; agregar permisos iOS aquí |
| `eas.json` | Perfiles build; agregar bloque iOS |
| `package.json` | Versión `1.0.1`, dependencias |
| `utils/notifyCanjeo.ts` | Telegram ya configurado (no tocar) |
| `utils/subscription.ts` | Sistema de canjeo/revocación (no tocar) |
| `app/admin-codigos.tsx` | Pantalla admin (no tocar) |
| `services/pdfExtractor/PdfDeterministicExtractor.ts` | Extractor JAVER ya validado en Hermes (no tocar) |
| `app/estimacion/[id].tsx` | Grid crítico, scroll sync funciona en Android — verificar en iOS que `ScrollView` compartido con refs se comporta igual |

---

## REGLAS CRÍTICAS QUE EL PM DEBE RESPETAR

1. **Hermes está activo en iOS también** — las reglas anti-lookahead, paréntesis en `||` + `??`, y FlatList-no-en-ScrollView siguen aplicando.
2. **No bumpear versión hasta que el build iOS sea estable** (mantener `1.0.1` por ahora)
3. **Cualquier cambio en `app.json` invalida el fingerprint** — EAS lo recalculará automáticamente
4. **Bundle identifier `com.estimafacil.app` ya está reservado en EAS** — no cambiarlo
5. **No correr `eas init` ni `eas project:init`** — el proyecto ya está enlazado (`projectId: 31e1d3c5-fa0f-4e7c-96c4-27565587317e`, owner `jorgeml`)
6. **Memoria del PM**: hay un `MEMORY.md` en `C:\Users\Arqjo\.claude\projects\C--CLAUDE-CODE-AGENCY-AGENTS\memory\` que carga auto. Actualizar `project_estimafacil_v2.md` al final de la sesión con resultado del build iOS.

---

## DATOS RÁPIDOS

| Dato | Valor |
|------|-------|
| Ruta local | `C:\CLAUDE CODE\AGENCY AGENTS\estima-facilV2` |
| Branch | `master` |
| Último commit Android | `95fd6f8` |
| EAS owner | `jorgeml` |
| EAS slug | `estimafacil` |
| Project ID | `31e1d3c5-fa0f-4e7c-96c4-27565587317e` |
| Bundle iOS | `com.estimafacil.app` |
| Versión | `1.0.1` |
| Build Android actual (referencia) | `249a09f0-fd4b-455d-b596-3aaab5de247c` |

---

## CHECKLIST AL FINAL DE LA SESIÓN

- [ ] `eas.json` con perfil iOS commiteado
- [ ] `app.json` con permisos iOS si aplican
- [ ] UDID del iPhone registrado en EAS
- [ ] Build iOS encolado (capturar build ID)
- [ ] Memoria actualizada (`project_estimafacil_v2.md`)
- [ ] Instrucciones claras de instalación entregadas a Arqjo
