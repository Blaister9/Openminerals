#!/usr/bin/env python3
"""Importa de forma conservadora la base ZIP de Openminerals a un clon GitHub.

No usa tokens ni escribe variables de Railway. Por defecto deja los cambios
commiteados solo localmente; usar --push para publicar por Git autenticado.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

DEFAULT_REPO = "https://github.com/Blaister9/Openminerals.git"
PREFIX = "openminerals-foundation/"


def cmd(args: list[str], *, cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f"Comando falló: {' '.join(args)}\n{result.stderr.strip() or result.stdout.strip()}")
    return result


def normalized_remote(value: str) -> str:
    v = value.strip().removesuffix(".git").rstrip("/")
    match = re.match(r"(?:git@github\.com:|https?://github\.com/)([^/]+)/([^/]+)$", v, re.I)
    return f"github:{match.group(1).lower()}/{match.group(2).lower()}" if match else str(Path(v).expanduser().resolve()) if "://" not in v else v.lower()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def archive_files(archive: Path) -> dict[Path, bytes]:
    out: dict[Path, bytes] = {}
    with zipfile.ZipFile(archive) as z:
        for member in z.infolist():
            n = member.filename
            if member.is_dir():
                continue
            if not n.startswith(PREFIX):
                raise RuntimeError(f"Archivo fuera de la carpeta raíz esperada: {n}")
            sub = n[len(PREFIX):]
            parts = PurePosixPath(sub).parts
            if not parts or any(x in (".", "..") for x in parts) or any("\\" in x or ":" in x for x in parts):
                raise RuntimeError(f"Ruta sospechosa en ZIP: {n}")
            if ".git" in parts or "node_modules" in parts or any(x == ".env" for x in parts):
                raise RuntimeError(f"Contenido no permitido para repositorio: {n}")
            if member.external_attr >> 16 & 0o170000 == 0o120000:
                raise RuntimeError(f"Enlace simbólico rechazado dentro de ZIP: {n}")
            dest = Path(*parts)
            if dest in out:
                raise RuntimeError(f"Ruta duplicada en ZIP: {n}")
            out[dest] = z.read(member)
    if Path('api/src/domain.js') not in out or Path('mobile/App.tsx') not in out:
        raise RuntimeError("ZIP incompleto: faltan API o app móvil")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default=DEFAULT_REPO, help='URL GitHub; no cambiar salvo autorización')
    parser.add_argument('--zip', dest='archive', type=Path, default=Path('~/Downloads/Openminerals_Fundacion_Movil_Railway_GitHub.zip').expanduser())
    parser.add_argument('--dest', type=Path, default=Path('~/Projects/Openminerals').expanduser())
    parser.add_argument('--push', action='store_true', help='Publicar commit en GitHub mediante autenticación del equipo')
    parser.add_argument('--branch', help='Rama de importación cuando el remoto ya tiene commits')
    args = parser.parse_args()
    archive = args.archive.expanduser().resolve()
    dest = args.dest.expanduser().resolve()
    if not archive.is_file():
        raise RuntimeError(f"ZIP no encontrado: {archive}")
    if not shutil.which('git'):
        raise RuntimeError("Git no está instalado o no está en PATH")
    entries = archive_files(archive)
    if dest.exists():
        if not (dest / '.git').exists():
            if any(dest.iterdir()):
                raise RuntimeError(f"La carpeta no es repositorio Git y tiene archivos: {dest}")
            dest.rmdir()  # git clone utiliza este destino nuevo
        else:
            remote = cmd(['git', 'remote', 'get-url', 'origin'], cwd=dest).stdout.strip()
            if normalized_remote(remote) != normalized_remote(args.repo):
                raise RuntimeError(f"El origin local es distinto al destino solicitado: {remote}")
            if cmd(['git', 'status', '--porcelain'], cwd=dest).stdout.strip():
                raise RuntimeError("El repositorio tiene cambios locales: resolver o guardar antes de importar")
    if not (dest / '.git').exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"Clonando: {args.repo} → {dest}")
        cmd(['git', 'clone', args.repo, str(dest)])
    has_head = cmd(['git', 'rev-parse', '--verify', 'HEAD'], cwd=dest, check=False).returncode == 0
    collisions = []
    additions = []
    for relative, data in entries.items():
        target = dest / relative
        if target.exists():
            if not target.is_file() or digest(target.read_bytes()) != digest(data):
                collisions.append(str(relative))
        else:
            additions.append((relative, data))
    if collisions:
        shown = '\n - '.join(collisions[:25])
        raise RuntimeError(
            f"Colisión: estos archivos ya existen pero son diferentes:\n - {shown}"
            f"\nNo se sobrescribió ningún archivo. Pedir a Codex integrar manualmente en una rama."
        )
    if not additions:
        print(f"Sin cambios: {dest}\nNo se requiere commit nuevo.")
        return 0
    if has_head:
        branch = args.branch or f"codex/openminerals-bootstrap-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d%H%M%S')}"
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,100}", branch) or '..' in branch:
            raise RuntimeError('Nombre de rama inválido')
        cmd(['git', 'switch', '-c', branch], cwd=dest)
    else:
        branch = 'main'
        cmd(['git', 'symbolic-ref', 'HEAD', 'refs/heads/main'], cwd=dest)
    for relative, data in additions:
        target = dest / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    cmd(['git', 'add', '-A'], cwd=dest)
    cmd(['git', 'diff', '--cached', '--check'], cwd=dest)
    cmd(['git', 'commit', '-m', 'chore: importar base móvil Openminerals y entrega Codex'], cwd=dest)
    sha = cmd(['git', 'rev-parse', '--short=12', 'HEAD'], cwd=dest).stdout.strip()
    print(f"Commit local: {sha}; rama: {branch}; carpeta: {dest}")
    if args.push:
        cmd(['git', 'push', '-u', 'origin', branch], cwd=dest)
        print(f"Push verificado: {branch} → {args.repo}. Revisar workflow y abrir PR si corresponde.")
    else:
        print(f"Aún sin publicar. Para subir desde el PC autenticado: git -C {dest} push -u origin {branch}")
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, OSError, zipfile.BadZipFile) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
