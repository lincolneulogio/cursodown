# Fase 2 + 3 — Motor de descarga + TypeScript core

Fecha: 2026-08-28

## Fase 2 — Extraer motor de descarga

### Hecho

- [x] `app/core/services/download.service.js` — motor EventEmitter (start/pause/resume, capítulos, HLS, subtítulos, adjuntos, DRM, skip existing)
- [x] `app/helpers/download-ui.js` — adaptador jQuery ↔ eventos del servicio
- [x] `app.js` reducido: `startDownload` solo cablea UI
- [x] `m3u8.service` — `resolveSegmentUrls()` para HLS
- [x] Cola sin cambios de contrato (`enqueue` / `complete` / `cancel`)

### Criterio de done

| Criterio | Estado |
|---|---|
| Descargar curso desde el servicio | Listo (vía `DownloadService.start`) |
| Pause / resume | Listo (`session.pause` / `resume`) |
| HLS + subtítulos + adjuntos | En el servicio |
| Historial / librería | Sin cambios de contrato |

### Cómo probar

1. `npm run build:core && npm start`
2. Smoke MW-08, MW-09, MW-10, MW-11, MW-12, MW-13 de `MIGRATION_BASELINE.md`

---

## Fase 3 — TypeScript en core

### Estructura

```text
app/core/
  src/                         # fuentes TS
    types.ts                   # modelos de dominio
    ipc.ts                     # contratos window.udeler
    download-queue.service.ts
    m3u8.service.ts
    library.service.ts
  services/                    # runtime (JS) + .d.ts
    download.service.js        # aún JS (grande); tipado vía .d.ts
    udemy.service.js           # aún JS; tipado vía .d.ts
    *.js                       # emitidos por tsc
  tsconfig.json
```

### Scripts

- `npm run build:core` — compila `src/` → `services/`
- `npm run typecheck` — `tsc --noEmit`
- `npm run dev` — build:core + electron developer

### Pendiente (siguiente iteración TS)

- Portar `download.service.js` → `.ts`
- Portar `udemy.service.js` → `.ts`
- Tipar `settings` / store

---

## Archivos tocados (resumen)

| Archivo | Rol |
|---|---|
| `download.service.js` | Motor |
| `download-ui.js` | UI bridge |
| `app.js` | Orquestación UI fina |
| `m3u8` / `queue` / `library` | TS + compile |
| `types.ts` / `ipc.ts` | Contratos |
