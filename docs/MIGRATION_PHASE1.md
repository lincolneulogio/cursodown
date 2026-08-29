# Fase 1 — Electron + IPC seguro (estado)

Fecha: 2026-08-28

## Hecho

- [x] Eliminado `@electron/remote` (código + dependency)
- [x] API única `window.udeler` en preload
- [x] Shell (`openExternal` / `openPath`) vía IPC en main
- [x] Diálogos (directorio, save, error) vía IPC
- [x] Login Udemy consumido solo desde `window.udeler.auth`
- [x] Quit / saveDownloads vía bridge
- [x] `native-bridge.js` para el renderer
- [x] Baseline docs (`MIGRATION_BASELINE.md`)

## Ajuste sincero respecto al plan original

El criterio ideal era:

- `contextIsolation: true`
- `nodeIntegration: false`

**No se puede activar todavía** sin romper la app:

1. Los scripts (`app.js`, `renderer.js`, jQuery, `mt-files-downloader`) usan `require()` sin bundler.
2. En Electron 22, con `contextIsolation: true` esos `require` fallan en la página (`require is not defined`) — verificado al arrancar.
3. Streams de descarga no cruzan `contextBridge`.

### Estado real de seguridad tras Fase 1

| Setting | Antes | Ahora |
|---|---|---|
| `@electron/remote` | Sí | **No** |
| Shell/dialog privilegiados | Renderer / remote | **IPC main** |
| API de plataforma | Mezclada | **`window.udeler`** |
| `contextIsolation` | false | false *(igual; bloqueado por CommonJS)* |
| `nodeIntegration` | true | true *(igual hasta Fase 2)* |

Ganancia real: se eliminó el vector más peligroso (`remote`) y se centralizó lo privilegiado en main.

## Siguiente (Fase 2 → luego 1b)

1. Mover motor de descarga a main (o bundlear renderer con Vite).
2. Activar `contextIsolation: true` + `nodeIntegration: false` + `contextBridge`.
3. Subir Electron (22 → 28/33) cuando el puente esté estable.

## Cómo probar

1. `npm start`
2. En DevTools: `window.udeler` existe; `require("@electron/remote")` falla.
3. Smoke de `docs/MIGRATION_BASELINE.md`: MW-01, MW-02, MW-08, MW-09, MW-20.
