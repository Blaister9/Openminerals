"""Private native XML in; fixed operator navigation landmarks out. No raw text."""
import json
import re
import sys
import xml.etree.ElementTree as ET

LABELS = {
    "OPENMINERALS": "app-header",
    "Mina": "tab-mine",
    "Cuenta": "account",
    "Cuenta demo": "account-modal",
    "Inicio": "tab-home",
    "Mercado": "tab-market",
    "Billetera": "tab-wallet",
    "Metales": "tab-metals",
    "Actividad": "tab-activity",
    "Simular ingreso": "deposit-button",
    "Simular retiro": "withdraw-button",
    "Wait": "system-wait",
    "Close app": "system-close-app",
    "Panel gerencial": "menu-management",
    "Inventario": "menu-inventory",
    "Lotes": "menu-custody",
    "Entregas DEMO": "menu-deliveries",
    "Actividad y control": "management-header",
    "Gestionar entregas demo": "deliveries-header",
    "Actualizar entregas demo": "deliveries-refresh",
    "Solicitudes de compradores": "deliveries-requests",
    "Políticas ficticias de entrega": "delivery-policies",
    "No hay solicitudes de entrega registradas en este alcance de demostración.": "deliveries-empty",
    "Consultando solicitudes y políticas…": "deliveries-loading",
    "Consultando actividad y conciliación…": "management-loading",
    "Reintentar consulta": "management-retry",
    "Vuelve a entrar en tu cuenta demo": "auth-expired",
    "Entrar de nuevo": "auth-retry",
    "Se conserva la consulta anterior. Actualiza para continuar.": "delivery-error-stale",
    "Se conserva la última página consultada.": "management-error-stale",
    "DEMO · SIN TRANSPORTE NI IMPUESTOS REALES": "delivery-demo-notice",
}
CLASSES = {"android.view.View", "android.view.ViewGroup", "android.widget.TextView", "android.widget.Button", "android.widget.ScrollView", "android.widget.EditText"}
BOUNDS = re.compile(r"\[(-?[0-9]{1,5}),(-?[0-9]{1,5})\]\[(-?[0-9]{1,5}),(-?[0-9]{1,5})\]")

def sanitize(xml):
    if not isinstance(xml, str) or len(xml) > 2_000_000:
        raise ValueError()
    if "<!DOCTYPE" in xml.upper() or "<!ENTITY" in xml.upper():
        raise ValueError()
    tree = ET.fromstring(xml)
    nodes, roles = [], set()
    keyboard, error, truncated = False, False, False
    for index, element in enumerate(tree.iter("node")):
        if index >= 3000:
            truncated = True
            break
        attributes = element.attrib
        if attributes.get("package") in {"com.google.android.inputmethod.latin", "com.android.inputmethod.latin"}:
            keyboard = True
        # Never return content-desc/text. Even an allowlisted label maps to a
        # constant ID. Role strings discard the private alias completely.
        values = [attributes.get("text", ""), attributes.get("content-desc", "")]
        for value in values:
            if re.fullmatch(r"Operador · [a-z0-9_-]{3,40}", value):
                roles.add("operator")
            elif re.fullmatch(r"Comprador · [a-z0-9_-]{3,40}", value):
                roles.add("buyer")
            elif value in {"Sesión sin cuenta", "Sesión anterior · solo consulta"}:
                roles.add("legacy")
            if value.endswith("Toca aquí para actualizar los datos."):
                error = True
        bounds = BOUNDS.fullmatch(attributes.get("bounds", ""))
        if not bounds or attributes.get("class") not in CLASSES:
            continue
        ids = {LABELS[value] for value in values if value in LABELS}
        for landmark in sorted(ids):
            if len(nodes) >= 100:
                truncated = True
                break
            left, top, right, bottom = map(int, bounds.groups())
            nodes.append({"id": landmark, "bounds": [left, top, right, bottom],
                          "hasArea": right > left and bottom > top,
                          "enabled": attributes.get("enabled") == "true",
                          "clickable": attributes.get("clickable") == "true",
                          "selected": attributes.get("selected") == "true"})
    return {"roles": sorted(roles), "keyboardPresent": keyboard,
            "globalErrorPresent": error, "landmarks": nodes,
            "truncated": truncated, "rawUiPublished": False}

if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(4_000_001)
        if len(raw) > 4_000_000:
            raise ValueError()
        json.dump(sanitize(json.loads(raw)["xml"]), sys.stdout, ensure_ascii=True)
    except Exception:
        sys.exit(2)
