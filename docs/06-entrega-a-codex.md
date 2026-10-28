# Openminerals — Transferencia y sincronización con Codex

**Repositorio objetivo:** `https://github.com/Blaister9/Openminerals.git`.

**Entorno de infraestructura:** Railway del usuario, todavía sin acceso/autorización desde esta sesión. Codex del PC realizará el despliegue una vez valide los proyectos disponibles.

## Importación (sin forzar ni sobrescribir)

El ZIP anterior incluye la carpeta contenedora `openminerals-foundation/`. Su contenido debe ubicarse directamente en la raíz de `Openminerals`, con esta estructura:

```text
Openminerals/
├── AGENTS.md
├── README.md
├── .github/workflows/ci.yml
├── api/
│   ├── package.json
│   ├── railway.json
│   ├── src/
│   └── test/
├── mobile/
│   ├── App.tsx
│   ├── app.json
│   └── eas.json
├── docs/
│   ├── Diseno_Maestro_Ejecutivo.pdf
│   └── ...
└── tools/
```

El PDF descargado por separado ya está incluido en `docs/` y no hay que duplicarlo.

Se puede ejecutar `tools/import_to_github.py` desde una carpeta externa (o el archivo suelto `importar_openminerals_github.py` suministrado con la entrega):

```bash
python importar_openminerals_github.py \
  --zip ~/Downloads/Openminerals_Entrega_para_Codex.zip \
  --dest ~/Projects/Openminerals \
  --push
```

En Windows PowerShell puede usarse:

```powershell
py .\importar_openminerals_github.py --zip "$HOME\Downloads\Openminerals_Entrega_para_Codex.zip" --dest "$HOME\Projects\Openminerals" --push
```

**Precauciones del importador:** exige Git y Python, comprueba que la carpeta corresponda al remoto previsto, rechaza una carpeta Git con modificaciones, no sobreescribe contenidos diferentes, no usa `push --force`, y crea una rama `codex/*` si detecta repositorio con commits. Si el remoto contiene un README diferente u otros archivos en conflicto, se detiene y deja a Codex hacer la integración manual en una rama. `--push` necesita autenticación GitHub configurada **en el PC**. No publica nada desde esta sesión.

Para usar el ZIP **original** ya descargado, cambiar solo el argumento `--zip` por `Openminerals_Fundacion_Movil_Railway_GitHub.zip`; ese ZIP no contiene `AGENTS.md`, que sí está en la entrega actualizada.

## Orden de ejecución posterior

1. Confirmar subida y comprobar la estructura y el workflow de GitHub.
2. Validar API y móvil localmente; generar lockfiles, corregir tipos/dependencias.
3. En Railway verificar recursos existentes, enlazar API y PostgreSQL y exponer HTTPS; confirmar `/health` con `postgres-demo`.
4. Configurar URL API en build EAS; compilar APK e iOS.
5. Probar el flujo en teléfonos físicos; anotar lo que sí y lo que no está implementado.

Las instrucciones detalladas para el agente están en `AGENTS.md`. No interpretar las pruebas de motor/HTTP en memoria como prueba de PostgreSQL, compilación nativa o instalación real.
