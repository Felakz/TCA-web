# Panel interno — SQLite (HU10 / HU04)

La versión actual usa React + TypeScript + Vite y una API local Node.js con SQLite. No requiere cuenta de Supabase ni claves VITE_SUPABASE. El catálogo público conserva HTML y JavaScript.

## Inicio local

Requiere Node.js 24 LTS. Desde `inventario/panel`:

```powershell
npm ci
npm run user:create -- brenda@ejemplo.com
```

El comando pide una contraseña de al menos 12 caracteres; no hay cuentas ni contraseñas predeterminadas. La entrada de contraseña se oculta en la terminal. La cuenta creada queda habilitada para el equipo interno.

En una terminal:

```powershell
npm run server
```

En otra, desde el mismo directorio:

```powershell
npm run dev
```

Abrir la URL que imprime Vite, normalmente `http://127.0.0.1:5173`. Usar siempre el mismo hostname. Vite envía `/api` al servidor local en el puerto 3001. El servidor escucha solo en 127.0.0.1. La entrada HTML heredada apunta al build; para desarrollo usar Vite directamente.

Los datos se guardan en `inventario/panel/data/tca.sqlite`, fuera de los archivos de interfaz, y se excluyen de Git. Se crea automáticamente el esquema y un producto de prueba con stock 20. Reiniciar el servidor no reinicia el stock. No servir el directorio `data` mediante un servidor estático. Para respaldar, detener la API y copiar todo `data`.

## Autenticación y protección

Las contraseñas se guardan como hashes scrypt con sal aleatoria. La sesión usa un token aleatorio en una cookie HttpOnly y SameSite=Strict, con vencimiento de ocho horas; SQLite guarda su hash. Cada consulta privada comprueba sesión y cuenta habilitada. El cierre elimina la sesión del servidor. El actor de un movimiento procede del usuario autenticado y no del formulario. Las entradas usan transacción y clave de idempotencia.

Esta configuración es para trabajo local. Para exponerla en red se requiere HTTPS, cookie Secure y configuración de despliegue; `vite preview` por sí solo no sirve la API. `npm run build` compila únicamente la interfaz.

## Verificar

```powershell
npm test
npm run test:server
npm run build
```

Los tests de React usan dobles del cliente. Las pruebas del servidor usan HTTP y una base SQLite temporal real: comprueban credenciales, lecturas y escrituras sin sesión, cierre, cuenta deshabilitada, persistencia e idempotencia.

## Migración posterior a Supabase

`migrations/001_inventario_initial.sql`, `002_hu10_acceso_interno.sql` y `migrations/tests/hu10_permisos.sql` son PostgreSQL/Supabase: se conservan como referencia futura y no se ejecutan con SQLite. El cliente de la interfaz está centralizado en `panel/src/client.ts` para facilitar el cambio posterior. No se ha implementado una exportación automática: habrá que trasladar productos y movimientos, mapear usuarios a UUID de Supabase Auth e invitar/recrear sus cuentas; no copiar hashes ni sesiones locales como credenciales de Supabase.

La lista de usuarios habilitados cubre S1; HU13 completará los roles. Responsable propuesta: Brenda Paola Zapata Mio. Trazabilidad: Word 3.3.3 y backlog 4.4. La decisión actual usa SQLite temporalmente; Supabase queda para una fase posterior.
