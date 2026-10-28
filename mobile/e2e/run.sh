#!/usr/bin/env bash
set -euo pipefail

capture_diagnostics() {
  adb logcat -d > "$RESULTS/logcat.txt" 2>&1 || true
  adb shell uiautomator dump /sdcard/window.xml > "$RESULTS/hierarchy-command.txt" 2>&1 || true
  adb pull /sdcard/window.xml "$RESULTS/view-hierarchy.xml" >/dev/null 2>&1 || true
  adb exec-out screencap -p > "$RESULTS/final-screen.png" 2> "$RESULTS/screencap-error.txt" || true
}
trap capture_diagnostics EXIT

curl --fail --max-time 20 --proto '=https' \
  https://openminerals-api-demo.up.railway.app/health > "$RESULTS/health.json"
python3 - <<'PY'
import json, os, pathlib
health = json.loads(pathlib.Path(os.environ['RESULTS'], 'health.json').read_text())
assert health['ok'] is True and health['demoOnly'] is True
assert health['mode'] == 'postgres-demo'
PY

adb shell settings put global animator_duration_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global window_animation_scale 1
adb install -r "$RUNNER_TEMP/android-ui/app.apk"
adb shell pm path com.openminerals.demo.mobile | grep '^package:'
maestro --no-ansi test --format JUNIT --output "$RESULTS/report.xml" \
  --debug-output "$RESULTS/debug" --test-output-dir "$RESULTS/screenshots" \
  "${MAESTRO_FLOW:-mobile/e2e/demo.yaml}" 2>&1 | tee "$RESULTS/maestro-console.txt"
