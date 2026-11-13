// Solo para regresiones históricas que atraviesan varios departamentos.
// Las pruebas HU13 usan cuentas con roles fijos y NO importan este helper.
export function fixtureRole(route) {
 if (route.startsWith('reposicion')) return 'GERENCIA';
 if (route === 'entradas' || route.startsWith('movimientos') || route.includes('/despachar')) return 'ALMACEN';
 return 'VENTAS';
}
