"""Plot recorded Openminerals evidence, never inferred native r5 results.

Python 3.10+ and Matplotlib are required. No app dependency is changed.
Example from the repository root:
  python tools/plot_mine_optimization.py
After downloading a complete r4-candidate native profile:
  python tools/plot_mine_optimization.py --native-comparison PATH/summary.json \
      --output artifacts/charts-with-native-r5
The optional input accepts the profiler's original summary.json or the existing
analysis.json row projection. It rejects missing values, other version codes,
unequal light endpoints and anything other than two actual light trials per APK.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import MaxNLocator

REPO = Path(__file__).resolve().parents[1]
EVIDENCE = REPO / "docs/evidence/sprint-optimization-20261102"
COLORS = {"stable": "#64748B", "r4": "#B7791F", "r5": "#087F7A"}
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10, "axes.titlesize": 11,
    "axes.labelcolor": "#334155", "text.color": "#0F172A",
    "axes.edgecolor": "#CBD5E1", "xtick.color": "#475569",
    "ytick.color": "#475569", "svg.fonttype": "none",
    "svg.hashsalt": "openminerals-measured-evidence-v1",
})


def read_json(path: Path) -> dict:
    with path.open(encoding="utf-8-sig") as source:
        return json.load(source)


def public_source_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return path.name


def finite(value, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError(f"Missing or invalid recorded {label}; no value will be inferred.")
    return float(value)


def light_rows(document: dict, codes: tuple[int, int]) -> dict[int, list[dict]]:
    if document.get("complete") is not True:
        raise ValueError("Only a completed native collection can be plotted.")
    rows = document.get("rows")
    if rows is None:
        rows = [{
            "trial": item["trial"], "versionCode": item["app"]["code"],
            "visualMode": item["visualMode"],
            "uiP95Ms": item.get("hwui", {}).get("p95Ms"),
            "sustainedMedianPssKiB": item.get("memory", {}).get("sustainedMedianPssKiB"),
            "qualityEquivalentAtEndpoints": item.get("qualityEquivalentAtEndpoints"),
            "initialMode": item.get("initialScene", {}).get("mode"),
            "finalMode": item.get("finalScene", {}).get("mode"),
        } for item in document.get("results", [])]
    groups = {}
    for code in codes:
        selected = sorted((row for row in rows if row.get("visualMode") == "light" and row.get("versionCode") == code), key=lambda row: row["trial"])
        if len(selected) != 2 or len({row["trial"] for row in selected}) != 2:
            raise ValueError(f"Expected two actual light-mode trials for Android code {code}.")
        for row in selected:
            if row.get("qualityEquivalentAtEndpoints") is not True or row.get("initialMode") != "light" or row.get("finalMode") != "light":
                raise ValueError("Light-mode endpoints must be comparable; no sustained 3D result is inferred.")
            finite(row.get("uiP95Ms"), "HWUI p95")
            finite(row.get("sustainedMedianPssKiB"), "sustained PSS median")
        groups[code] = selected
    return groups


def style_axis(axis):
    axis.spines[["top", "right"]].set_visible(False)
    axis.grid(axis="y", color="#E2E8F0", linewidth=.8)
    axis.set_axisbelow(True)
    axis.yaxis.set_major_locator(MaxNLocator(nbins=5))


def native_chart(groups: dict, codes: tuple[int, int], labels: tuple[str, str], title: str):
    fig, axes = plt.subplots(1, 2, figsize=(11.8, 4.9))
    fig.subplots_adjust(top=.77, bottom=.25, left=.08, right=.98, wspace=.30)
    fig.suptitle(title, x=.08, y=.96, ha="left", fontsize=17, weight="bold")
    fig.text(.08, .875, "Modo ligero explícito · dos observaciones por APK · orden ABBA", fontsize=10, color="#475569")
    specs = [("uiP95Ms", 1, "Latencia HWUI · p95 de la cola capturada", "Milisegundos"),
             ("sustainedMedianPssKiB", 1/1024, "PSS sostenida · mediana de muestras finales", "MiB")]
    for axis, (field, scale, heading, unit) in zip(axes, specs):
        all_values = []
        for index, code in enumerate(codes):
            color = COLORS["stable"] if code == 6 else COLORS["r4"] if code == 4 else COLORS["r5"]
            for offset, row in zip([-.13, .13], groups[code]):
                value = row[field] * scale
                all_values.append(value)
                axis.scatter(index+offset, value, color=color, s=58, zorder=3, edgecolor="white", linewidth=.8)
                axis.annotate(f"{value:.1f}\nintento {row['trial']}", (index+offset, value), xytext=(-5 if offset < 0 else 5, -33 if offset < 0 else 10), textcoords="offset points", ha="right" if offset < 0 else "left", fontsize=9, color=color)
        axis.set(title=heading, ylabel=unit, xticks=[0, 1], xticklabels=labels, xlim=(-.60, 1.60), ylim=(0, max(all_values)*1.28))
        style_axis(axis)
    fig.text(.08, .13, "Android API 29 · x86_64 · SwiftShader. HWUI: FrameCompleted − IntendedVsync; cola de 120 filas.", fontsize=9, color="#475569")
    fig.text(.08, .085, "PSS: muestreo ~1 s; mediana de la mitad final. No es memoria máxima continua ni tiempo de GPU.", fontsize=9, color="#475569")
    fig.text(.08, .04, "Sin aceptación en teléfono. Las observaciones de dos intentos no constituyen un intervalo de confianza.", fontsize=9, color="#475569")
    return fig


def software_chart(reports: list[dict]):
    for report in reports:
        if report.get("android") is not False or report.get("displayFpsMeasured") is not False:
            raise ValueError("Software charts require explicit non-Android, non-FPS evidence.")
        if (report["protocol"]["width"], report["protocol"]["height"]) != (360, 640):
            raise ValueError("The repeated software panel compares only the recorded 360×640 pair.")
    by_run = [{row["id"]: row for row in report["results"]} for report in reports]
    for identity in ["r4-full", "candidate"]:
        if by_run[0][identity]["sourceHashes"] != by_run[1][identity]["sourceHashes"]:
            raise ValueError("Repeated conditions must have identical source hashes.")
    fig, axes = plt.subplots(2, 3, figsize=(11.8, 7.6), sharex=True, sharey="row")
    fig.subplots_adjust(top=.81, bottom=.23, left=.07, right=.98, hspace=.27, wspace=.12)
    fig.suptitle("Render de software · r4 frente a r5", x=.07, y=.965, ha="left", fontsize=17, weight="bold")
    fig.text(.07, .905, "360×640 · mismos shaders de la app y poses fijas · dos ejecuciones independientes", fontsize=10, color="#475569")
    legend = [Line2D([0], [0], marker="o", color=COLORS["r4"], label="r4 congelada"), Line2D([0], [0], marker="s", color=COLORS["r5"], label="r5 · fuentes medidas en software")]
    fig.legend(handles=legend, loc="upper right", bbox_to_anchor=(.985, .92), ncol=2, frameon=False, fontsize=9)
    normalized = []
    for row_index, metric in enumerate(["p50Ms", "p95Ms"]):
        for column, (phase, label) in enumerate([("all", "Todas las poses"), ("mine", "Mina y extracción"), ("subject", "Lingote y custodia")]):
            axis = axes[row_index, column]
            if row_index == 0:
                axis.set_title(label, pad=12)
            for identity, color, marker in [("r4-full", COLORS["r4"], "o"), ("candidate", COLORS["r5"], "s")]:
                values = [finite(run[identity]["stats"][phase][metric], metric) for run in by_run]
                axis.plot([0, 1], values, color=color, marker=marker, markersize=6, linewidth=1.2)
                for run_index, value in enumerate(values):
                    axis.annotate(f"{value:.1f}", (run_index, value), xytext=(0, 8 if identity == "r4-full" else -16), textcoords="offset points", ha="center", fontsize=9, color=color)
                    normalized.append({"run": "AB"[run_index], "condition": identity, "phase": phase, "metric": metric, "valueMs": value})
            axis.set(xlim=(-.35, 1.35), xticks=[0, 1], xticklabels=["Ejecución A", "Ejecución B"], ylim=(0, 18 if row_index == 0 else 29))
            if column == 0:
                axis.set_ylabel(("p50" if row_index == 0 else "p95")+" · milisegundos")
            style_axis(axis)
    fig.text(.07, .15, "Métrica: envío del renderer + finalización SwiftShader + lectura RGBA completa; compilación excluida.", fontsize=9, color="#475569")
    fig.text(.07, .105, "66 muestras por condición y ejecución (36 mina; 30 lingote). Orden de condiciones alternado por ronda.", fontsize=9, color="#475569")
    fig.text(.07, .06, "Estos valores no son HWUI, GPU aislada ni FPS Android. No establecen aceptación nativa de r5.", fontsize=9, color="#475569")
    return fig, normalized


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, default=EVIDENCE)
    parser.add_argument("--output", type=Path, default=EVIDENCE / "charts")
    parser.add_argument("--native-comparison", type=Path)
    parser.add_argument("--overwrite", action="store_true", help="Replace generated chart files only.")
    args = parser.parse_args()
    evidence, output = args.evidence.resolve(), args.output.resolve()
    baseline_path = evidence / "android-baseline-controlled/analysis.json"
    software_paths = [evidence / f"software-combined-{letter}/report.json" for letter in ["a", "b"]]
    baseline = read_json(baseline_path)
    baseline_groups = light_rows(baseline, (6, 4))
    reports = [read_json(path) for path in software_paths]
    optional_groups = light_rows(read_json(args.native_comparison), (4, 5)) if args.native_comparison else None
    names = ["native-baseline-light", "software-r4-r5-repeated"] + (["native-r4-r5-light"] if optional_groups else [])
    protected = [output / (name+extension) for name in names for extension in [".png", ".svg"]] + [output / "chart-data.json", output / "native-r4-r5.pending.json"]
    if not args.overwrite and any(path.exists() for path in protected):
        raise ValueError("Output already contains generated charts; choose a new directory or --overwrite.")
    output.mkdir(parents=True, exist_ok=True)
    figures = {"native-baseline-light": native_chart(baseline_groups, (6, 4), ("Estable 0.3.0", "Mina Preview r4"), "Diagnóstico nativo · regresión anterior a r5")}
    figures["software-r4-r5-repeated"], normalized = software_chart(reports)
    if optional_groups:
        figures["native-r4-r5-light"] = native_chart(optional_groups, (4, 5), ("Mina Preview r4", "Mina Preview r5"), "Comparación nativa medida · r4 frente a r5")
    for name, figure in figures.items():
        figure.savefig(output / (name+".png"), dpi=180, facecolor="white", metadata={"Software": "Openminerals evidence plot"})
        figure.savefig(output / (name+".svg"), facecolor="white", metadata={"Date": None, "Creator": "Openminerals evidence plot"})
        # Matplotlib wraps path data with spaces before newlines. Normalize only
        # generated SVG formatting; measured source evidence stays byte-exact.
        svg = output / (name+".svg")
        with svg.open("r", encoding="utf-8") as stream:
            lines = stream.read().splitlines()
        with svg.open("w", encoding="utf-8", newline="\n") as stream:
            stream.write("\n".join(line.rstrip() for line in lines)+"\n")
        plt.close(figure)
    inputs = [baseline_path, *software_paths] + ([args.native_comparison.resolve()] if args.native_comparison else [])
    chart_data = {
        "demoOnly": True, "plottingLibrary": "Matplotlib "+matplotlib.__version__,
        "nativeR5Included": optional_groups is not None,
        "sources": [{"file": public_source_path(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in inputs],
        "baselineLightRows": {str(code): rows for code, rows in baseline_groups.items()},
        "softwarePoints": normalized,
        "nativeR4R5LightRows": {str(code): rows for code, rows in optional_groups.items()} if optional_groups else None,
        "scope": "HWUI and PSS native panels are separate from software completion/readback. No GPU or ExpoGL FPS is inferred.",
    }
    (output / "chart-data.json").write_text(json.dumps(chart_data, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    pending = {
        "status": "measured-native-comparison-plotted" if optional_groups else "pending-native-r5-no-values-invented",
        "acceptedInput": "A complete original mine-profile summary.json, or its analysis.json projection, with two measured light-mode trials each for versionCode 4 and 5.",
        "command": "python tools/plot_mine_optimization.py --native-comparison PATH/summary.json --output artifacts/charts-with-native-r5",
        "safety": "Unavailable or incomplete inputs fail validation. No synthetic points, substitution of software timings or unmeasured r5 native data.",
    }
    (output / "native-r4-r5.pending.json").write_text(json.dumps(pending, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "figures": names, "nativeR5Included": optional_groups is not None}, ensure_ascii=False))


if __name__ == "__main__":
    main()
