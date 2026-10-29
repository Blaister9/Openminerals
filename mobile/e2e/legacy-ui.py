"""Read private uiautomator XML from stdin; emit only the legacy UI allowlist."""
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

MAX_INPUT = 4_000_000
MAX_XML = 2_000_000
MAX_NODES = 1000
NUMBER = re.compile(r"(?:(?:COP|EUR|USD|USDT)\s*)?[+-]?[0-9]{1,12}(?:[.,][0-9]{1,3})?")
CLASS = re.compile(r"(?:[A-Za-z_$][A-Za-z0-9_$]*\.)+[A-Za-z_$][A-Za-z0-9_$]*")
BOUNDS = re.compile(r"\[-?[0-9]{1,5},-?[0-9]{1,5}\]\[-?[0-9]{1,5},-?[0-9]{1,5}\]")

def literal_labels(selectors):
    labels = set()
    for selector in selectors:
        if not isinstance(selector, str) or len(selector) > 240:
            continue
        label = selector.removeprefix("(?i)").removeprefix("^").removesuffix("$").strip()
        if not label or re.search(r"[\\.*+?()\[\]{}|]", label):
            continue
        labels.add(unicodedata.normalize("NFC", label))
    return sorted(labels)

def description(value, labels):
    normalized = unicodedata.normalize("NFC", value)
    if len(normalized) > 280:
        return None
    if NUMBER.fullmatch(normalized):
        return normalized
    for label in labels:
        if normalized.casefold() == label.casefold():
            return label
        # A label may be combined with a numeric input value by accessibility.
        if normalized[:len(label)].casefold() == label.casefold():
            suffix = normalized[len(label):]
            if re.fullmatch(r"[, :;]{1,4}" + NUMBER.pattern, suffix):
                return normalized
    return None

def sanitize(xml, selectors):
    if not isinstance(xml, str) or len(xml) > MAX_XML:
        raise ValueError("XML size")
    if "<!DOCTYPE" in xml.upper() or "<!ENTITY" in xml.upper():
        raise ValueError("XML declarations")
    tree = ET.fromstring(xml)
    labels = literal_labels(selectors)
    result = []
    truncated = False
    for element in tree.iter("node"):
        if len(result) == MAX_NODES:
            truncated = True
            break
        attributes = element.attrib
        classname, bounds = attributes.get("class", ""), attributes.get("bounds", "")
        if not CLASS.fullmatch(classname) or len(classname) > 160 or not BOUNDS.fullmatch(bounds):
            continue
        if attributes.get("enabled") not in ("true", "false") or attributes.get("scrollable") not in ("true", "false"):
            continue
        node = {"class": classname, "bounds": bounds, "enabled": attributes["enabled"] == "true", "scrollable": attributes["scrollable"] == "true"}
        if classname.endswith(".EditText"):
            text = attributes.get("text", "")
            if NUMBER.fullmatch(text):
                node["text"] = text
            allowed = description(attributes.get("content-desc", ""), labels)
            if allowed is not None:
                node["contentDescription"] = allowed
        result.append(node)
    return {"nodes": result, "truncated": truncated}

def main():
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT:
        raise ValueError("Input size")
    request = json.loads(raw)
    if not isinstance(request.get("selectors"), list) or len(request["selectors"]) > 300:
        raise ValueError("Selectors")
    json.dump(sanitize(request.get("xml"), request["selectors"]), sys.stdout, ensure_ascii=True)

if __name__ == "__main__":
    try:
        main()
    except Exception:
        # No XML, attribute, exception payload, host environment or stack trace.
        sys.exit(2)
