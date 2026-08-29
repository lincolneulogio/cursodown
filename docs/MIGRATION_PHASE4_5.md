# Fase 4 + 5 — UI React + limpieza

Fecha: 2026-08-28

## Fase 4 — React + Tailwind + Vite

### Estructura

```text
src/
  main/index.js          # Electron main (contextIsolation + nodeIntegration false)
  preload/index.js       # window.udeler (servicios Node)
  renderer/              # React + Tailwind
  shared/udeler.d.ts     # contratos IPC/UI
dist/renderer/           # build Vite
```

### Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite + Electron (UI caliente) |
| `npm start` | build core+renderer + Electron |
| `npm run build:renderer` | solo Vite |
| `npm test` | smoke queue / m3u8 / planner |

### Seguridad (criterio Fase 1 pendiente, cerrado aquí)

- `contextIsolation: true`
- `nodeIntegration: false`
- negocio en preload; React solo ve `window.udeler`

## Fase 5 — Limpieza

- [x] Persistencia local con `settings-store.js` (JSON en userData; preload-safe, sin IPC de electron-store)
- [x] UI sin jQuery / Semantic / dialogs
- [x] Tests smoke (`tests/core.smoke.test.mjs`) — 5 passed
- [x] Quitados del package: jquery, dialogs, electron-settings, electron-store
- [ ] Sustituir `mt-files-downloader` (siguiente iteración; ya aislado en `DownloadService`)

### Legacy

`app/index.html` + `app/app.js` quedan en el repo como referencia, **ya no se cargan**.
