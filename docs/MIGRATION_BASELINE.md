# Fase 0 — Baseline de comportamiento (no romper en la migración)

Fecha de congelado: 2026-08-28  
App: CursoDown / Udeler (Electron + jQuery)

Usa esta lista **antes** de cada fase. Marca OK / FAIL / N/A. Si algo falla tras un cambio, no avances de fase.

---

## 1. Funciones must-work

| ID | Función | Pasos de verificación | Resultado | Notas |
|---|---|---|---|---|
| MW-01 | Login Udemy (cookies) | Botón login → ventana Udemy → sesión válida → dashboard | ☐ | |
| MW-02 | Login por access token | Pegar token (+ client_id opcional) → dashboard | ☐ | |
| MW-03 | Udemy Business (subdominio) | Marcar Business → subdomain → login OK | ☐ | |
| MW-04 | Listar cursos | Tras login, carga primera página de cursos | ☐ | |
| MW-05 | Buscar cursos | Buscar por nombre; resultados coherentes | ☐ | |
| MW-06 | Load more / paginación | Cargar más cursos | ☐ | |
| MW-07 | Planner de capítulos | Al descargar, modal con árbol; select all; DRM banner | ☐ | |
| MW-08 | Descarga normal (MP4) | Descargar curso sin DRM; archivos en carpeta | ☐ | |
| MW-09 | Pause / Resume | Pausar mid-download; reanudar; continúa (.mtd) | ☐ | |
| MW-10 | HLS / m3u8 | Curso/lecture HLS; vídeo ensamblado OK | ☐ | |
| MW-11 | Subtítulos VTT→SRT | Con subtítulos ON; existe `.srt` en `/subs` | ☐ | |
| MW-12 | Skip DRM | Lecture con DRM se omite; no tumba el curso (según settings) | ☐ | |
| MW-13 | Adjuntos / artículos | PDF/html/url se guardan | ☐ | |
| MW-14 | Export playlist m3u | Guardar `.m3u` del curso | ☐ | |
| MW-15 | Librería local | Ver cursos descargados; Abrir carpeta; Borrar | ☐ | |
| MW-16 | Settings | Cambiar path, calidad, cola, skip existing; persiste al reiniciar | ☐ | |
| MW-17 | Temas dark/light | Cambiar tema; se aplica y persiste | ☐ | |
| MW-18 | i18n | Cambiar idioma UI; textos traducidos | ☐ | |
| MW-19 | Guardar cola al cerrar | Con descarga activa, cerrar app; al reabrir estado coherente | ☐ | |
| MW-20 | Abrir carpeta / links externos | Open dir, open in browser, help token | ☐ | |

---

## 2. Matriz de cursos de prueba (5–10)

Rellena con cursos reales de tu cuenta. No subas tokens ni URLs privadas a git si son sensibles; puedes usar solo IDs internos.

| # | Alias | Tipo cuenta | DRM | HLS | Adjuntos | Subtítulos | ID / URL interna | Usado en |
|---|---|---|---|---|---|---|---|---|
| C1 | | www / personal | No | No | No | Sí | | MW-08, MW-11 |
| C2 | | www / personal | No | Sí | No | Sí | | MW-10 |
| C3 | | www / personal | Parcial | ? | Sí | Sí | | MW-12, MW-13 |
| C4 | | www / personal | Alto DRM | ? | ? | ? | | MW-12 |
| C5 | | Business (subdomain) | No | ? | ? | Sí | | MW-03, MW-04 |
| C6 | | Business | Parcial | Sí | Sí | Sí | | MW-03 + mix |
| C7 | | Subscription / enrollments | No | ? | No | No | | MW-05 búsqueda |
| C8 | | Corto (<20 lectures) | No | No | No | Sí | | smoke diario |
| C9 | | Largo / muchos capítulos | Mix | Mix | Sí | Sí | | MW-07 planner + cola |
| C10 | | Solo attachments / article | No | No | Sí | No | | MW-13 |

### Cómo capturar baseline (recomendado)

1. Anota versión (`package.json`) y commit/hash actual.
2. Ejecuta `npm run start` (o `dev`).
3. Completa MW-01 → MW-20 con C8 primero (smoke).
4. Repite descargas críticas con C1–C4 y al menos un Business (C5/C6).
5. Guarda capturas o log de `Logger` si algo es flaky.

### Evidencia sugerida (local, no commitear secretos)

- Carpeta de descarga de C8 con estructura de capítulos
- Un `.srt` generado
- Un `.m3u` exportado
- Screenshot de planner con DRM %

---

## 3. Estado técnico al congelar (referencia)

| Ítem | Valor al baseline |
|---|---|
| Electron | 22.3.27 (EOL) |
| Renderer | jQuery + Semantic UI + `app.js` monolítico |
| Node en renderer | `nodeIntegration: true`, `contextIsolation: false` |
| Remote | `@electron/remote` en uso |
| Downloader | `mt-files-downloader` (GitHub) |
| Settings | `electron-settings@3` |

---

## 4. Criterio para cerrar Fase 0

- [ ] Tabla must-work rellenada al menos en smoke (C8 + login + 1 descarga)
- [ ] Matriz con ≥5 cursos identificados (aunque algunos campos queden pendientes)
- [ ] Este archivo versionado en el repo

> Checklist creado el 2026-08-28. Completa las marcas OK/FAIL con tu cuenta real antes de dar por estable la Fase 1.
