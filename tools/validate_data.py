"""Prüft die Inhaltsdaten der App auf Konsistenz.

Aufruf:  python tools/validate_data.py
Prüft: gültiges JSON, Übungs-IDs, Familien, Dosierungen, Block-IDs in Wochenplänen,
Quellenverweise [n] in Texten und refs-Listen, Schweizer Rechtschreibung (kein ß).
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
DATA = Path(__file__).resolve().parent.parent / "data"
errors, warnings = [], []


def load(name):
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        errors.append(f"{name}: kein gültiges JSON ({e})")
        return None


ex_data, prog, tests, sources, theory = (load(n) for n in
    ["exercises.json", "program.json", "tests.json", "sources.json", "theory.json"])
if errors:
    print("\n".join(errors))
    sys.exit(1)

source_ids = {s["n"] for s in sources["sources"]}
families = set(ex_data["families"])
equipment = set(ex_data["equipment"])
exercises = {}
for e in ex_data["exercises"]:
    if e["id"] in exercises:
        errors.append(f"Übung doppelt: {e['id']}")
    exercises[e["id"]] = e


def check_refs(where, refs):
    for r in refs or []:
        if r not in source_ids:
            errors.append(f"{where}: Quelle [{r}] existiert nicht")


def check_text_refs(where, text, allowed=None):
    for m in re.findall(r"\[(\d+(?:,\s*\d+)*)\]", text):
        for r in (int(x) for x in m.split(",")):
            if r not in source_ids:
                errors.append(f"{where}: Textverweis [{r}] existiert nicht")
            elif allowed is not None and r not in allowed:
                warnings.append(f"{where}: Textverweis [{r}] fehlt in der refs-Liste")


# Übungen
for e in exercises.values():
    w = f"Übung {e['id']}"
    if e["family"] not in families:
        errors.append(f"{w}: unbekannte Familie {e['family']}")
    for eq in e["equipment"]:
        if eq not in equipment:
            errors.append(f"{w}: unbekanntes Gerät {eq}")
    for k in ("easier", "harder"):
        if k in e and e[k] not in exercises:
            errors.append(f"{w}: {k} → {e[k]} existiert nicht")
    if not e.get("cues"):
        warnings.append(f"{w}: keine Hinweise")
    check_refs(w, e.get("refs"))

# Programm
doses = set(prog["doses"]) | {"circuit", "plyo"}
blocks = {b["id"]: b for b in prog["blocks"]}
for b in prog["blocks"]:
    w = f"Block {b['id']}"
    check_refs(w, b.get("refs"))
    for it in b.get("items", []):
        if it["ex"] == "@level":
            continue
        ids = [it["ex"]] + list(it.get("byPhase", {}).values())
        for i in ids:
            if i not in exercises:
                errors.append(f"{w}: Übung {i} existiert nicht")
            elif exercises[i]["family"] != it["family"] and it["family"] != "power":
                warnings.append(f"{w}: {i} ist Familie {exercises[i]['family']}, Slot sagt {it['family']}")
            elif exercises[i]["impact"] > b["maxImpact"]:
                errors.append(f"{w}: {i} hat Aufprall {exercises[i]['impact']} > Block-Maximum {b['maxImpact']}")
        if it["dose"] not in doses:
            errors.append(f"{w}: Dosierung {it['dose']} unbekannt")
    for lvl, items in b.get("levels", {}).items():
        for it in items:
            if it["ex"] not in exercises:
                errors.append(f"{w} Stufe {lvl}: Übung {it['ex']} existiert nicht")
    for ver, segs in b.get("segments", {}).items():
        mins = sum(s.get("min", 0) + (s["repeat"] * (s["work"]["sec"] + s["rest"]["sec"]) / 60 if "repeat" in s else 0) for s in segs)
        if b["category"] == "endurance" and abs(mins - b["minutes"][ver]) > 6:
            warnings.append(f"{w} {ver}: Segmente ergeben {mins:.0f} Min, angegeben {b['minutes'][ver]}")

for ph, days in prog["weekTemplates"].items():
    for n, week in days.items():
        if len(week) != int(n):
            errors.append(f"Wochenplan Phase {ph}/{n} Tage: {len(week)} Tage statt {n}")
        for day in week:
            for bid in day:
                if bid not in blocks:
                    errors.append(f"Wochenplan Phase {ph}: Block {bid} existiert nicht")
                elif blocks[bid]["minPhase"] > int(ph):
                    errors.append(f"Wochenplan Phase {ph}: Block {bid} erst ab Phase {blocks[bid]['minPhase']}")
for p in prog["phases"]:
    check_refs(f"Phase {p['id']}", p.get("refs"))
for r in prog["rules"]:
    check_refs(f"Regel {r['id']}", r.get("refs"))
    check_text_refs(f"Regel {r['id']}", r["text"])

# Tests
for t in tests["battery"]["tests"]:
    check_refs(f"Test {t['id']}", t.get("refs"))
check_refs("Eintrittstest", tests["phase4Entry"]["refs"])
check_text_refs("Testbatterie", tests["battery"]["gradeNote"])
check_refs("Ampel", tests["pelvicCheck"]["ampel"]["refs"])

# Theorie
cited = set()
for ch in theory["chapters"]:
    allowed = set(ch["refs"])
    check_refs(ch["id"], ch["refs"])
    texts = list(ch["summary"])
    for blk in ch["content"]:
        texts += blk.get("items", []) + ([blk["x"]] if "x" in blk else [])
    for t in texts:
        check_text_refs(ch["id"], t, allowed)
        cited |= {int(x) for m in re.findall(r"\[(\d+(?:,\s*\d+)*)\]", t) for x in m.split(",")}
unused = source_ids - cited
if unused:
    warnings.append(f"Quellen nie im Theorieteil zitiert: {sorted(unused)}")

# Service Worker: alle App-Dateien müssen im Offline-Cache stehen
root = DATA.parent
sw = (root / "sw.js").read_text(encoding="utf-8")
assets_block = re.search(r"const ASSETS = \[(.*?)\];", sw, re.S).group(1)
listed = set(re.findall(r"'([^']+\.(?:html|webmanifest|css|js|json|svg|png))'", assets_block))
for folder in ("css", "js", "data", "icons"):
    for f in (root / folder).rglob("*"):
        if f.is_file():
            rel = f.relative_to(root).as_posix()
            if rel not in listed:
                errors.append(f"sw.js: {rel} fehlt in ASSETS (offline nicht verfügbar)")
for rel in listed:
    if not (root / rel).exists():
        errors.append(f"sw.js: {rel} steht in ASSETS, existiert aber nicht")

# Rechtschreibung
for f in DATA.glob("*.json"):
    if "ß" in f.read_text(encoding="utf-8"):
        errors.append(f"{f.name}: enthält ß (Schweizer Rechtschreibung: ss)")

print(f"{len(exercises)} Übungen, {len(families)} Familien, {len(blocks)} Blöcke, "
      f"{len(theory['chapters'])} Kapitel, {len(source_ids)} Quellen")
for w in warnings:
    print("WARNUNG:", w)
for e in errors:
    print("FEHLER:", e)
print("OK" if not errors else f"{len(errors)} Fehler")
sys.exit(1 if errors else 0)
