# Respaldo cifrado del operador demo

`operator-demo.enc.json` contiene el respaldo **cifrado y autenticado** de las credenciales del operador de la mina demo. No contiene su clave de descifrado. Se publica para poder trasladar el acceso desde este repositorio sin hacer pública la contraseña del operador.

La copia legible del propietario y la clave de recuperación se guardaron en el PC original en:

```text
%USERPROFILE%\Downloads\Openminerals-acceso-operador-PRIVADO.json
```

Para encontrarla en Windows, pulsar **Win+R**, escribir `%USERPROFILE%\Downloads` y abrir `Openminerals-acceso-operador-PRIVADO.json` con un editor de texto. Es un archivo local: no tratar la ruta `C:/...` como una página web.

Ese único archivo privado incluye el alias y la contraseña que se pueden usar directamente en la app, más `backupKeyBase64` para recuperar el respaldo. Guardarlo en un gestor de contraseñas o trasladarlo por un medio privado. **No subirlo a GitHub, al release ni a un issue.**

Desde un clon de la rama vigente en otro equipo, con Node.js instalado y el archivo privado trasladado:

```powershell
node tools/restore-demo-access.mjs --key-file "$env:USERPROFILE\Downloads\Openminerals-acceso-operador-PRIVADO.json"
```

En macOS/Linux, adaptar la ruta:

```sh
node tools/restore-demo-access.mjs --key-file "$HOME/Downloads/Openminerals-acceso-operador-PRIVADO.json"
```

El resultado se escribe en `Downloads/openminerals-demo-access-restored.json`, fuera de Git. Se puede elegir un archivo nuevo en una carpeta existente con `--out RUTA_ARCHIVO`; el restaurador rechaza carpetas dentro de repositorios y no sobrescribe archivos. Si se ha guardado el respaldo en otra ubicación, `--backup RUTA_ARCHIVO_CIFRADO` selecciona ese archivo.

Cifrado AES-256-GCM con clave aleatoria de 32 bytes, nonce de 12 bytes y tag de 16 bytes. Se probaron recuperación idéntica al original, rechazo de clave incorrecta y de datos alterados, bloqueo de destino Git y restauración mediante la CLI. El restaurador no imprime el contenido privado.

Sin el archivo privado o su clave no es posible descifrar este respaldo. En tal caso, la administración de Railway puede crear otro operador en la misma mina, como explica [la guía de continuidad](../docs/12-continuar-desde-otro-equipo.md). No reiniciar la base ni las cuentas para recuperar acceso.
