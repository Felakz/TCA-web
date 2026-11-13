# Panel interno — SQLite (HU10 / HU04 / HU05)

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

## HU05 — Confirmar pedidos y reservar

El panel incluye **Pedidos y reservas**. Seleccionar producto y unidades y pulsar **Confirmar pedido y reservar**. La interfaz permite un producto por pedido; la API admite hasta 100 productos distintos por pedido. **Actualizar disponibilidad** relee el estado del servidor, por ejemplo después de una operación desde otra sesión.

- Físico = `stock_actual`; reservado = suma de líneas de pedidos CONFIRMADOS; disponible = físico − reservado.
- Confirmar no reduce físico. Una transacción `BEGIN IMMEDIATE` toma el bloqueo de escritura antes de comprobar disponibilidad y guardar todas las líneas. Si falla una línea, no se reserva ninguna.
- El identificador del pedido permite reintentar sin duplicar reservas. Reutilizarlo con otros datos, otro actor o después de cancelar se rechaza con HTTP 409.
- Cancelar cambia de CONFIRMADO a CANCELADO una sola vez, guarda fecha y usuario de cancelación y libera la reserva por el cambio de estado. Las repeticiones devuelven el estado cancelado sin una segunda liberación.
- Todas las rutas requieren una sesión habilitada. La separación fina Ventas/Almacén sigue pendiente de HU13.

El esquema `migrations/sqlite/002_hu05_reservas.sql` se aplica automáticamente al iniciar la API y conserva inventario, usuarios y movimientos existentes. Reiniciar `npm run server` después de actualizar. No ejecutar las migraciones PostgreSQL con SQLite. Respaldar la base antes de actualizar.

API: `GET /api/pedidos`, `POST /api/pedidos/confirmar` con `{ "id": "pedido-001", "lineas": [{ "producto_id": "PROD-TEST-001", "cantidad": 10 }] }`, y `POST /api/pedidos/pedido-001/cancelar` con `{}`. Inventario devuelve `stock_actual`, `reservado` y `disponible`. Las pruebas usan bases temporales con físico 30; no se modifica el stock real para preparar demostraciones.

Ver `VERIFICACION_HU05.md` para los casos ejecutados. Referencia de concurrencia: [transacciones SQLite](https://www.sqlite.org/lang_transaction.html). La función transaccional PostgreSQL se implementará al migrar a Supabase.
