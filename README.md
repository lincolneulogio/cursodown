<span id="top"></span>

<p align="center">
  <img src="app/assets/images/logo64.png" alt="CursoDown" width="128" />
</p>

<h1 align="center">CursoDown</h1>

<p align="center">
  <strong>Descargador de cursos de Udemy para escritorio</strong><br />
  Electron · React · TypeScript · Tailwind CSS
</p>

<p align="center">
  <a href="https://github.com/lincolneulogio/cursodown/releases">
    <img alt="release" src="https://img.shields.io/github/v/release/lincolneulogio/cursodown?style=for-the-badge&labelColor=0b0e14&color=17A89F" />
  </a>
  <a href="https://github.com/lincolneulogio/cursodown/actions/workflows/ci.yml">
    <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/lincolneulogio/cursodown/ci.yml?branch=main&style=for-the-badge&label=CI&labelColor=0b0e14" />
  </a>
  <a href="https://github.com/lincolneulogio/cursodown/actions/workflows/publish.yml">
    <img alt="Publish" src="https://img.shields.io/github/actions/workflow/status/lincolneulogio/cursodown/publish.yml?style=for-the-badge&label=Publish&labelColor=0b0e14" />
  </a>
  <a href="https://github.com/lincolneulogio/cursodown/actions/workflows/codeql-analysis.yml">
    <img alt="CodeQL" src="https://img.shields.io/github/actions/workflow/status/lincolneulogio/cursodown/codeql-analysis.yml?branch=main&style=for-the-badge&label=CodeQL&labelColor=0b0e14" />
  </a>
  <a href="LICENSE">
    <img alt="license" src="https://img.shields.io/badge/license-MIT-1C1E26?style=for-the-badge&labelColor=0b0e14&color=61ffca" />
  </a>
</p>

---

Aplicación multiplataforma para descargar **tus cursos inscritos** en Udemy (gratuitos o de pago).  
Basada en el proyecto original de [@FaisalUmair](https://github.com/FaisalUmair/udemy-downloader-gui) y el mantenimiento posterior de la comunidad.

> [!WARNING]
> Uso personal únicamente. Respetá los [Términos de Uso de Udemy](https://www.udemy.com/terms/).  
> No rompe DRM: los videos cifrados se omiten. El desarrollador no se responsabiliza por sanciones en tu cuenta.

## Características

- Login con cuenta Udemy / Udemy Business o Access Token
- Listado y búsqueda de cursos inscritos
- Planificador de descarga por secciones / lecciones
- Cola de descargas concurrentes
- Biblioteca local de cursos descargados
- UI moderna (React + Tailwind) en modo oscuro
- Builds para Windows, macOS y Linux vía GitHub Actions

## Requisitos

- [Node.js](https://nodejs.org/) 18+ (recomendado LTS)
- [Git](https://git-scm.com/)
- npm

## Instalación (desarrollo)

```bash
git clone https://github.com/lincolneulogio/cursodown.git
cd cursodown

cp .env.example .env   # en Windows: copy .env.example .env

npm install
npm start              # build + Electron
# o
npm run dev            # Vite HMR + Electron
```

### Scripts útiles

| Script | Descripción |
| --- | --- |
| `npm start` | Compila core + renderer y abre la app |
| `npm run dev` | Modo desarrollo con Vite |
| `npm test` | Tests (Vitest) |
| `npm run typecheck` | Typecheck del core |
| `npm run typecheck:ui` | Typecheck del renderer |
| `npm run build` | Genera instaladores con electron-builder |

## User Installation

To install a published version of CursoDown:

1. Go to the [Releases](https://github.com/lincolneulogio/cursodown/releases) page.
2. Download the installer available for your operating system.
3. Run the installer and follow the installation instructions.

## Authentication

CursoDown supports:

- Udemy account
- Udemy Business account
- Access Token

Use the authentication method available in your installation.

## DRM Limitations

CursoDown does not break or remove DRM.

Videos protected by DRM are skipped and are not downloaded.

## Frequently Asked Questions

### Where can I download CursoDown?

Published versions are available on the [Releases](https://github.com/lincolneulogio/cursodown/releases) page.

### Does CursoDown support Udemy Business?

Yes. CursoDown supports authentication with a Udemy Business account.

### Can I use an Access Token?

Yes. CursoDown supports authentication using an Access Token.

### Does CursoDown download DRM-protected videos?

No. DRM-protected videos are skipped and are not downloaded.




## Releases e instaladores

Los releases se publican automáticamente al crear un tag `v*`:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Eso dispara el workflow **Publish**, que genera paquetes en:

| Plataforma | Paquetes |
| --- | --- |
| Windows | Setup (NSIS) + Portable (x64 / ia32) |
| macOS | DMG / app |
| Linux | AppImage, deb, rpm, freebsd |

Descargas: [Releases](https://github.com/lincolneulogio/cursodown/releases)

> La firma de código (auto-update) requiere configuración propia. Ver [electron-builder code signing](https://www.electron.build/code-signing).

## CI / CD

| Workflow | Qué hace |
| --- | --- |
| [CI](.github/workflows/ci.yml) | Install, typecheck, tests en push/PR a `main` |
| [Publish](.github/workflows/publish.yml) | Build multi-OS y adjunta artefactos al release |
| [CodeQL](.github/workflows/codeql-analysis.yml) | Análisis estático de seguridad |

## Estructura

```
cursodown/
├── src/main/          # Proceso principal Electron
├── src/preload/       # Bridge seguro IPC
├── src/renderer/      # UI React + Tailwind
├── app/core/          # Servicios (download, udemy, m3u8, library)
├── app/locale/        # i18n
├── .github/workflows/ # Actions
└── docs/              # Migración y contribución
```

## Contribuir

1. Abrí un [issue](https://github.com/lincolneulogio/cursodown/issues) o usá las plantillas
2. Creá un fork / branch
3. Abrí un Pull Request

Guías: [CONTRIBUTING](docs/CONTRIBUTING.md) · [SECURITY](docs/SECURITY.md) · [CODE OF CONDUCT](docs/CODE_OF_CONDUCT.md)

## Créditos

- Autor actual: **Lincol Eulogio Huanca**
- Proyecto original: [@FaisalUmair](https://github.com/FaisalUmair/udemy-downloader-gui)
- Fork / mantenimiento previo: [@heliomarpm](https://github.com/heliomarpm/udemy-downloader-gui)

## Licencia

[MIT](LICENSE) — ver archivo para detalles de copyright original.

<a href="#top">↑ arriba</a>
