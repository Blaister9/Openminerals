# Acceso público de demostración

El propietario solicitó expresamente publicar el alias y la contraseña de este **operador demo** para continuar las pruebas desde cualquier equipo.

## Entrar en la aplicación

1. Instalar [Openminerals Demo 0.1.3 para Android](https://github.com/Blaister9/Openminerals/releases/download/v0.1.3-demo/Openminerals-Demo-0.1.3-android.apk) como actualización sin desinstalar.
2. Abrir [operator-public.json](operator-public.json): `alias` es el usuario y `password` es la clave, publicados en texto legible.
3. En la app, pulsar **Cuenta → Entrar** y utilizar esos valores.
4. El operador abre **Mina**. Pulsar **Actualizar panel de mina** para ver el inventario compartido, operaciones y reservas ficticias. Puede registrar ingresos de metal simulados.

No hace falta recuperar archivos de AppData, trasladar una clave ni descifrar el respaldo anterior para usar este acceso demo. Si hay una operación pendiente en una cuenta compradora, resolverla antes de cambiar de cuenta; no borrar sus datos locales para forzar el cambio.

API: <https://openminerals-api-demo.up.railway.app>. La mina es `openminerals-demo-v1`. La cuenta es compartida y pública; sus reposiciones afectan al inventario de esta simulación. Los compradores mantienen cuentas y claves propias, y el operador no recibe sus saldos privados.

El login HTTPS, el rol, la mina, la conciliación del resumen y el cierre de la sesión de verificación se comprobaron antes de publicar el archivo. Esto no acredita todavía una prueba física de cuentas/SecureStore en Android.

Todo el saldo, cotizaciones, metales, reservas y transacciones es ficticio. Este acceso público no es una credencial de producción ni una clave administrativa de Railway, Expo, GitHub o PostgreSQL.
