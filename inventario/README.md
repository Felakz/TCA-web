# Panel interno — SQLite (HU10 / HU04 / HU05 / HU06 / HU08 / HU13)

La versión actual usa React + TypeScript + Vite y una API local Node.js con SQLite. No requiere cuenta de Supabase ni claves VITE_SUPABASE. El catálogo público conserva HTML y JavaScript.

## Inicio local

Requiere Node.js 24 LTS. Desde `inventario/panel`:

```powershell
npm ci
npm run user:create -- brenda@ejemplo.com GERENCIA
```

El comando pide una contraseña de al menos 12 caracteres; no hay cuentas ni contraseñas predeterminadas. La entrada de contraseña se oculta en la terminal. El argumento final asigna el rol; omitirlo crea una cuenta SIN_ASIGNAR, sin permisos internos.

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

HU13 aplica roles en la API SQLite y en el panel. Responsable propuesta: Brenda Paola Zapata Mio. Trazabilidad: Word 3.3.3 y backlog 4.4. La decisión actual usa SQLite temporalmente; Supabase queda para una fase posterior.

## HU05 — Confirmar pedidos y reservar

El panel incluye **Pedidos y reservas**. Seleccionar producto y unidades y pulsar **Confirmar pedido y reservar**. La interfaz permite un producto por pedido; la API admite hasta 100 productos distintos por pedido. **Actualizar disponibilidad** relee el estado del servidor, por ejemplo después de una operación desde otra sesión.

- Físico = `stock_actual`; reservado = suma de líneas de pedidos CONFIRMADOS; disponible = físico − reservado.
- Confirmar no reduce físico. Una transacción `BEGIN IMMEDIATE` toma el bloqueo de escritura antes de comprobar disponibilidad y guardar todas las líneas. Si falla una línea, no se reserva ninguna.
- El identificador del pedido permite reintentar sin duplicar reservas. Reutilizarlo con otros datos, otro actor o después de cancelar se rechaza con HTTP 409.
- Cancelar cambia de CONFIRMADO a CANCELADO una sola vez, guarda fecha y usuario de cancelación y libera la reserva por el cambio de estado. Las repeticiones devuelven el estado cancelado sin una segunda liberación.
- Todas las rutas privadas requieren una sesión habilitada y el rol apropiado: Ventas confirma y cancela; Almacén despacha.

El esquema `migrations/sqlite/002_hu05_reservas.sql` se aplica automáticamente al iniciar la API y conserva inventario, usuarios y movimientos existentes. Reiniciar `npm run server` después de actualizar. No ejecutar las migraciones PostgreSQL con SQLite. Respaldar la base antes de actualizar.

API: `GET /api/pedidos`, `POST /api/pedidos/confirmar` con `{ "id": "pedido-001", "lineas": [{ "producto_id": "PROD-TEST-001", "cantidad": 10 }] }`, y `POST /api/pedidos/pedido-001/cancelar` con `{}`. Inventario devuelve `stock_actual`, `reservado` y `disponible`. Las pruebas usan bases temporales con físico 30; no se modifica el stock real para preparar demostraciones.

Ver `VERIFICACION_HU05.md` para los casos ejecutados. Referencia de concurrencia: [transacciones SQLite](https://www.sqlite.org/lang_transaction.html). La función transaccional PostgreSQL se implementará al migrar a Supabase.

## HU06 — Despachar y emitir constancia interna

En **Pedidos y reservas**, un pedido CONFIRMADO tiene el botón **Despachar pedido**. El servidor procesa todas las líneas en una transacción: descuenta físico, registra movimientos SALIDA, cambia el pedido a DESPACHADO y guarda una constancia. La reserva se libera al dejar de estar CONFIRMADO. Ejemplo: físico 30 y reservado 10 pasan a físico 20 y reservado 0; disponible permanece en 20.

Reintentar el despacho devuelve la misma constancia sin descontar otra vez. Un pedido cancelado no se puede despachar y uno despachado no se puede cancelar ni reconfirmar. Una falla intermedia revierte la operación completa. Se conserva el estado y el documento después de reiniciar.

La constancia incluye identificador, pedido, fecha, responsable y productos/cantidades con sus nombres al despachar. Se muestra con la leyenda **CONSTANCIA INTERNA DE DESPACHO — SIN VALOR TRIBUTARIO**. **Descargar constancia interna** genera un archivo de texto; **Ver constancia** permite recuperarla después. No es comprobante de pago ni documento tributario.

Rutas protegidas: `POST /api/pedidos/:id/despachar` con `{}` y `GET /api/pedidos/:id/constancia`. El historial distingue ENTRADA y SALIDA e indica el pedido asociado.

Reiniciar `npm run server` para aplicar `migrations/sqlite/003_hu06_despachos.sql`. La migración se ejecuta una vez, queda registrada en `schema_migrations` y conserva los pedidos y movimientos existentes. Respaldar la carpeta `data` con la API detenida antes de actualizar. El SQL 003 se ejecuta mediante `db.mjs`, que controla transacción, permisos de claves foráneas y comprobación de integridad; no pegarlo aislado en una consola.

HU13 limita entradas y despacho a Almacén; Gerencia puede consultar la información, sin ejecutar estas operaciones. Ver `VERIFICACION_HU06.md`. Supabase/PostgreSQL sigue pendiente para la migración posterior.

## HU08 — Alertas de mínimo y propuestas de compra

En **Alertas de stock mínimo y reposición**, configurar por producto:

- **Mínimo**: entero no negativo. El umbral es inclusivo: disponible menor o igual al mínimo activa la alerta.
- **Objetivo**: entero mayor que el mínimo. La sugerencia es objetivo menos disponibilidad; es una propuesta inicial, no una cantidad de compra obligatoria.
- **Habilitar alerta**: los productos existentes empiezan sin configuración activa. Un mínimo cero habilitado alerta al agotarse la disponibilidad.

Se usa la disponibilidad de HU05 (físico menos reservas confirmadas). Cada alerta tiene identificación `AL-MIN-producto`, texto **STOCK MÍNIMO ALCANZADO** y color. No depende solo del color. Actualiza al registrar entradas, reservar, cancelar o despachar desde el panel; también cada 30 segundos, al volver a la ventana o mediante **Actualizar alertas**. Los cambios en otra sesión pueden tardar hasta ese refresco.

**Crear propuesta** guarda un borrador por producto con la cantidad sugerida y el disponible/mínimo/objetivo de origen. La creación comprueba que la alerta siga activa en el servidor. Las cantidades y observaciones pueden revisarse y guardarse; cada revisión incrementa la versión para evitar sobrescribir una modificación de otra sesión. Si hay conflicto, copiar los cambios deseados, actualizar y revisar nuevamente. La API permite reintentar una creación con el mismo identificador sin duplicarla.

Las propuestas persisten aunque desaparezca la alerta. Su cantidad guardada no cambia automáticamente al variar el stock: revisar la vigencia con el disponible actual. Se mantiene un único borrador revisable por producto; esta historia no incluye órdenes de compra, archivo de propuestas ni envío al proveedor. No hay integración ni ruta de envío automático.

Reiniciar `npm run server` para aplicar automáticamente `migrations/sqlite/004_hu08_reposicion.sql`. La migración versionada añade tablas sin alterar stock, pedidos ni movimientos existentes. Respaldar `data` con la API detenida antes de actualizar.

Rutas protegidas: `GET /api/reposicion`, `POST /api/reposicion/configurar`, `POST /api/reposicion/propuestas` y `POST /api/reposicion/propuestas/:id/revisar`. La configuración y revisión registran usuario y fecha. HU13 restringe estos parámetros y propuestas a Gerencia.

Resultados y trazabilidad: `VERIFICACION_HU08.md`. Se mantiene SQLite; PostgreSQL/Auth/RLS queda pendiente para la migración a Supabase.

## HU13 — Permisos por rol

La autorización se comprueba en la API usando el rol y la habilitación guardados en SQLite en cada solicitud. El navegador no puede elegir su rol en el login ni concederse permisos enviando campos adicionales. Ocultar formularios es una ayuda visual; el servidor rechaza peticiones directas no autorizadas con HTTP 403, y sesiones inexistentes o revocadas con 401.

| Operación | Gerencia | Ventas | Almacén | Cliente / sin rol |
|---|---|---|---|---|
| Consultar inventario y pedidos internos | Sí | Sí | Sí | No |
| Consultar movimientos | Sí | No | Sí | No |
| Confirmar y cancelar pedidos | No | Sí | No | No |
| Registrar entradas y despachar | No | No | Sí | No |
| Consultar constancias emitidas | Sí | Sí | Sí | No |
| Configurar mínimos y revisar reposición | Sí | No | No | No |
| Crear usuarios, asignar roles y habilitar/deshabilitar | Sí | No | No | No |
| Catálogo comercial público | Sí | Sí | Sí | Sí, también sin sesión |

La separación es explícita: Gerencia no hereda las operaciones de Ventas o Almacén. Cliente solo obtiene `id`, `nombre`, `marca`, `imagen`, `descripcion` y `categoria` mediante `GET /api/catalogo`. El JSON estático actual también contiene únicamente campos comerciales. No se exponen costos, existencias, movimientos, pedidos, hashes ni sesiones mediante el catálogo.

### Actualizar una instalación existente

Respaldar `data` con la API detenida y reiniciar `npm run server`. La migración `005_hu13_roles.sql` asigna SIN_ASIGNAR a las cuentas existentes: no promueve automáticamente ninguna cuenta. Desde `inventario/panel`, asignar la cuenta inicial de Gerencia:

```powershell
npm run user:role -- brenda@ejemplo.com GERENCIA
```

Si aún no existe, crearla con `npm run user:create -- brenda@ejemplo.com GERENCIA`. Ambos comandos son administrativos locales y requieren acceso al archivo de base; no son rutas del navegador. `user:role` sirve también para recuperación y registra la asignación local en auditoría. Debe usarse desde una terminal de confianza. Luego iniciar sesión nuevamente.

Gerencia administra el resto desde **Usuarios autorizados**: crea cuentas con contraseña inicial, cambia roles y habilitación. Se muestran únicamente correo, identificador, rol y estado, nunca hashes ni contraseñas. Cambiar permisos revoca todas las sesiones del usuario y registra la acción; la cuenta debe iniciar sesión otra vez. La API impide deshabilitar o degradar la última Gerencia habilitada.

Los registros de usuarios y auditoría permanecen en SQLite. Las herramientas locales que pueden editar directamente el archivo de base están fuera del perímetro de autorización HTTP y deben reservarse al administrador del equipo.

### Límite actual de aceptación

**SQLite no implementa PostgreSQL/RLS.** En esta etapa la API local aplica los permisos. El criterio específico de políticas PostgreSQL/RLS queda pendiente de la migración a Supabase; no se declara acreditado por estas pruebas. No hay migración HU13 de Supabase aplicada. Ver `VERIFICACION_HU13.md`.
