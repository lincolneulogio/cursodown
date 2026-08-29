# Guía de usuario

CursoDown permite descargar los cursos en los que tu cuenta ya está inscrita.
Usá únicamente cuentas y contenido a los que tengas autorización de acceso, y
respetá los [Términos de Uso de Udemy](https://www.udemy.com/terms/).

## Instalar desde Releases

1. Abrí la página de [Releases](https://github.com/lincolneulogio/cursodown/releases).
2. Descargá el instalador correspondiente a tu sistema operativo: Windows
   (Setup o Portable), macOS (DMG) o Linux (AppImage, deb o rpm).
3. Instalá o ejecutá el paquete y abrí CursoDown.

Si no existe un paquete para tu arquitectura, usá la instalación desde código
descrita en el README. No ejecutes instaladores de fuentes no oficiales.

## Iniciar sesión

### Cuenta Udemy o Udemy Business

1. En la pantalla de inicio, elegí **Udemy Login**.
2. Para una cuenta Business, activá la opción correspondiente e introducí el
   subdominio de tu organización (sin `https://`); las cuentas personales usan
   `www` automáticamente.
3. Completá el inicio de sesión en la ventana de Udemy. Al volver a CursoDown,
   la aplicación validará la sesión y cargará tus cursos inscritos.

### Access Token

1. Elegí **Login with Access Token** para mostrar el campo del token.
2. Pegá un token obtenido mediante un flujo autorizado de Udemy. Si tu token
   incluye un `client_id` en el formato entregado por Udemy, CursoDown lo
   reconoce automáticamente.
3. Para Udemy Business, introducí primero el subdominio de tu organización;
   para cuentas personales dejalo vacío.
4. Confirmá el formulario. El perfil se valida antes de mostrar los cursos.

Los tokens son credenciales: no los publiques en issues, capturas, logs ni
repositorios. Si un token deja de funcionar, cerrá sesión y generá uno nuevo
según el procedimiento autorizado por Udemy.

## Descargas y DRM

Después de iniciar sesión, elegí un curso, seleccioná las secciones o lecciones
y definí la carpeta de descarga. CursoDown puede descargar contenido accesible
en formatos compatibles, pero **no rompe DRM**. Las lecciones cifradas se
omiten y se marcan como protegidas; esto no indica que el resto del curso haya
fallado.

## Preguntas frecuentes

### No aparecen mis cursos

Comprobá que la cuenta tenga inscripciones, que el subdominio Business sea
correcto y que la sesión no haya expirado. Cerrá sesión, iniciá sesión de nuevo
y revisá el mensaje mostrado por la aplicación.

### El token devuelve 403 o la sesión expira

El token puede haber caducado, haber sido revocado o pertenecer a otro
subdominio. No compartas el token; volvé a autenticarte o reemplazalo por uno
emitido para la cuenta y organización correctas.

### ¿Por qué algunas lecciones no se descargan?

El contenido protegido por DRM no es descargable con CursoDown. La aplicación
lo omite para que las demás lecciones puedan continuar.

### ¿Dónde se guardan los archivos?

La carpeta de descarga se puede elegir desde la interfaz. El historial de
descargas se conserva localmente para mostrar el estado de cursos ya procesados.
