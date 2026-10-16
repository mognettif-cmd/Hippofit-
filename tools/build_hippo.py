"""Erzeugt das HippoFit-Hippo in allen Varianten aus einer einzigen Vorlage.

Ausgabe in icons/:
  hippo.svg         ruhig (ohne Animation), transparenter Hintergrund
  hippo-anim.svg    Ruhe-Animation: blinzeln, Blümchen wippen, ab und zu flexen
  hippo-flex.svg    Jubel-Animation nach dem Training: kräftig flexen, Funken
  icon.svg          App-Icon mit Hintergrund (Favicon)
  icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
                    gerendert mit Chrome headless (gleiche Vorlage)

Aufruf:  python tools/build_hippo.py
"""
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
CHROME_CANDIDATES = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
]

# ---- Farben ----
SKIN = "#8e82b3"      # Lavendel-Grau
SKIN_DARK = "#6f6497"
SNOUT = "#b7acd8"
BELLY = "#b3a9d1"
LINE = "#4b4266"
PINK = "#f29bbd"
SUN = "#f5c84c"
CORAL = "#e8735f"
SAGE = "#6f9e7f"
WHITE = "#ffffff"

# ---- Das Hippo (viewBox 0 0 200 200) ----
# Gruppen mit Klassen, damit CSS sie animieren kann:
#   hf-flowers / hf-fl1..3, hf-arm-l / hf-arm-r, hf-bicep, hf-eyes, hf-spark
FLOWER = """
  <g transform="translate({x} {y})"><g class="hf-fl {cls}">
    <path d="M0 6 Q-2 16 1 24" stroke="{SAGE}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="5" cy="17" rx="4.5" ry="2.4" fill="{SAGE}" transform="rotate(-30 5 17)"/>
    <g fill="{petal}" stroke="{LINE}" stroke-width="1.6">
      <circle cx="0" cy="-7" r="5.2"/><circle cx="6.7" cy="-2.2" r="5.2"/><circle cx="4.1" cy="5.7" r="5.2"/>
      <circle cx="-4.1" cy="5.7" r="5.2"/><circle cx="-6.7" cy="-2.2" r="5.2"/>
    </g>
    <circle cx="0" cy="0" r="3.6" fill="{center}" stroke="{LINE}" stroke-width="1.4"/>
  </g></g>"""


def arm(side):
    """Doppelbizeps-Arm. side = -1 links, +1 rechts (gespiegelt um x = 100)."""
    s = "" if side < 0 else ' transform="matrix(-1 0 0 1 200 0)"'
    cls = "hf-arm-l" if side < 0 else "hf-arm-r"
    return f"""
  <g{s}><g class="hf-arm {cls}">
    <!-- Oberarm vom Schulteransatz zum Ellbogen -->
    <path d="M68 124 C54 117 34 118 21 123 C13 127 13 138 21 141 C36 145 56 143 70 140 Z"
          fill="{SKIN}" stroke="{LINE}" stroke-width="2.6" stroke-linejoin="round"/>
    <!-- Unterarm nach oben -->
    <path d="M13 134 C9 120 9 104 13 94 L28 94 C30 106 30 120 27 134 Z"
          fill="{SKIN}" stroke="{LINE}" stroke-width="2.6" stroke-linejoin="round"/>
    <!-- Bizeps (vor dem Unterarm, damit er gut sichtbar ist) -->
    <g class="hf-bicep"><path d="M24 125 C22 100 52 92 60 119 C50 123 36 125 24 125 Z"
          fill="{SKIN}" stroke="{LINE}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M32 108 C36 103 43 102 48 105" stroke="{WHITE}" stroke-opacity=".6" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>
    <!-- Schweissband und Faust -->
    <rect x="10.5" y="96" width="19" height="7" rx="3" fill="{CORAL}" stroke="{LINE}" stroke-width="2"/>
    <circle cx="20" cy="86" r="11.5" fill="{SKIN}" stroke="{LINE}" stroke-width="2.6"/>
    <path d="M14 84 h12 M14 89 h11" stroke="{LINE}" stroke-width="1.8" stroke-linecap="round"/>
    <!-- Kraft-Funken -->
    <g class="hf-spark" stroke="{SUN}" stroke-width="3" stroke-linecap="round">
      <path d="M38 92 l3 -7"/><path d="M50 97 l7 -4"/><path d="M58 106 l7 -1"/>
    </g>
  </g></g>"""


def hippo_body():
    flowers = "".join([
        FLOWER.format(cls="hf-fl1", x=68, y=26, petal=PINK, center=SUN, SAGE=SAGE, LINE=LINE),
        FLOWER.format(cls="hf-fl2", x=100, y=15, petal=SUN, center=CORAL, SAGE=SAGE, LINE=LINE),
        FLOWER.format(cls="hf-fl3", x=132, y=26, petal=WHITE, center=SUN, SAGE=SAGE, LINE=LINE),
    ])
    return f"""
  <!-- Blümchen -->
  <g class="hf-flowers">{flowers}
  </g>
  <!-- Beine -->
  <g fill="{SKIN_DARK}" stroke="{LINE}" stroke-width="2.6">
    <rect x="66" y="172" width="26" height="22" rx="10"/><rect x="108" y="172" width="26" height="22" rx="10"/>
  </g>
  <g fill="{LINE}" opacity=".5"><circle cx="72" cy="190" r="1.8"/><circle cx="79" cy="191" r="1.8"/><circle cx="86" cy="190" r="1.8"/>
    <circle cx="114" cy="190" r="1.8"/><circle cx="121" cy="191" r="1.8"/><circle cx="128" cy="190" r="1.8"/></g>
  <!-- Körper und Bauch -->
  <ellipse cx="100" cy="148" rx="44" ry="36" fill="{SKIN}" stroke="{LINE}" stroke-width="2.6"/>
  <ellipse cx="100" cy="156" rx="27" ry="23" fill="{BELLY}"/>
  {arm(-1)}{arm(1)}
  <!-- Ohren -->
  <g stroke="{LINE}" stroke-width="2.6">
    <ellipse cx="69" cy="62" rx="9" ry="11" fill="{SKIN}" transform="rotate(-20 69 62)"/>
    <ellipse cx="131" cy="62" rx="9" ry="11" fill="{SKIN}" transform="rotate(20 131 62)"/>
  </g>
  <ellipse cx="69" cy="63" rx="4" ry="6" fill="{PINK}" transform="rotate(-20 69 63)"/>
  <ellipse cx="131" cy="63" rx="4" ry="6" fill="{PINK}" transform="rotate(20 131 63)"/>
  <!-- Kopf -->
  <ellipse cx="100" cy="88" rx="37" ry="31" fill="{SKIN}" stroke="{LINE}" stroke-width="2.6"/>
  <!-- Stirnband -->
  <path d="M65 78 C78 66 122 66 135 78 L134 87 C121 76 79 76 66 87 Z" fill="{CORAL}" stroke="{LINE}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M70 80 C84 71 116 71 130 80" stroke="{WHITE}" stroke-opacity=".7" stroke-width="2" fill="none"/>
  <!-- Augen -->
  <g class="hf-eyes">
    <g><circle cx="86" cy="96" r="8.5" fill="{WHITE}" stroke="{LINE}" stroke-width="2.2"/><circle cx="88" cy="97" r="4.6" fill="{LINE}"/><circle cx="89.6" cy="95" r="1.6" fill="{WHITE}"/></g>
    <g><circle cx="114" cy="96" r="8.5" fill="{WHITE}" stroke="{LINE}" stroke-width="2.2"/><circle cx="112" cy="97" r="4.6" fill="{LINE}"/><circle cx="113.6" cy="95" r="1.6" fill="{WHITE}"/></g>
  </g>
  <!-- selbstbewusste Augenbrauen -->
  <path d="M77 86 L93 88 M123 86 L107 88" stroke="{LINE}" stroke-width="3" stroke-linecap="round"/>
  <!-- Schnauze -->
  <ellipse cx="100" cy="122" rx="40" ry="23" fill="{SNOUT}" stroke="{LINE}" stroke-width="2.6"/>
  <ellipse cx="87" cy="114" rx="4.6" ry="3.4" fill="{LINE}"/><ellipse cx="113" cy="114" rx="4.6" ry="3.4" fill="{LINE}"/>
  <!-- Lächeln mit Zähnchen -->
  <path d="M80 126 C90 138 110 138 120 126" stroke="{LINE}" stroke-width="2.6" fill="{WHITE}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M93 133.5 v-4.6 M107 133.5 v-4.6" stroke="{LINE}" stroke-width="1.6" stroke-linecap="round"/>
  <ellipse cx="74" cy="122" rx="5" ry="3" fill="{PINK}" opacity=".7"/><ellipse cx="126" cy="122" rx="5" ry="3" fill="{PINK}" opacity=".7"/>"""


# ---- Animationen (CSS im SVG; funktioniert auch als <img>) ----
BASE_CSS = """
  .hf-fl, .hf-arm, .hf-bicep, .hf-eyes > g, .hf-spark { transform-box: fill-box; }
  .hf-spark { opacity: 0; }
"""
IDLE_CSS = BASE_CSS + """
  @media (prefers-reduced-motion: no-preference) {
    .hf-fl { transform-origin: 50% 100%; animation: hf-sway 3.2s ease-in-out infinite; }
    .hf-fl2 { animation-delay: -1.1s; } .hf-fl3 { animation-delay: -2.2s; }
    .hf-eyes > g { transform-origin: 50% 50%; animation: hf-blink 5s infinite; }
    .hf-arm { transform-origin: 90% 70%; animation: hf-flex-soft 6s ease-in-out infinite; }
    .hf-bicep { transform-origin: 50% 100%; animation: hf-pump-soft 6s ease-in-out infinite; }
    .hf-spark { animation: hf-spark-soft 6s ease-in-out infinite; }
  }
  @keyframes hf-sway { 0%,100% { transform: rotate(-6deg) translateY(0); } 50% { transform: rotate(6deg) translateY(-2px); } }
  @keyframes hf-blink { 0%,46%,50%,100% { transform: scaleY(1); } 48% { transform: scaleY(.1); } }
  @keyframes hf-flex-soft { 0%,70%,100% { transform: rotate(0); } 78%,90% { transform: rotate(-5deg); } }
  @keyframes hf-pump-soft { 0%,70%,100% { transform: scale(1); } 78%,90% { transform: scale(1.18); } }
  @keyframes hf-spark-soft { 0%,74%,94%,100% { opacity: 0; } 80%,88% { opacity: 1; } }
"""
FLEX_CSS = BASE_CSS + """
  @media (prefers-reduced-motion: no-preference) {
    .hf-fl { transform-origin: 50% 100%; animation: hf-hop .9s ease-in-out infinite; }
    .hf-fl2 { animation-delay: -.3s; } .hf-fl3 { animation-delay: -.6s; }
    .hf-arm { transform-origin: 90% 70%; animation: hf-flex 1.2s ease-in-out infinite; }
    .hf-bicep { transform-origin: 50% 100%; animation: hf-pump 1.2s ease-in-out infinite; }
    .hf-spark { animation: hf-sparkle 1.2s ease-in-out infinite; }
  }
  @media (prefers-reduced-motion: reduce) { .hf-spark { opacity: 1; } .hf-bicep { transform: scale(1.15); transform-origin: 50% 100%; } }
  @keyframes hf-hop { 0%,100% { transform: translateY(0) rotate(-8deg); } 50% { transform: translateY(-6px) rotate(8deg); } }
  @keyframes hf-flex { 0%,100% { transform: rotate(0); } 45%,60% { transform: rotate(-8deg); } }
  @keyframes hf-pump { 0%,100% { transform: scale(1); } 45%,60% { transform: scale(1.25); } }
  @keyframes hf-sparkle { 0%,30%,80%,100% { opacity: 0; } 45%,65% { opacity: 1; } }
"""


def svg(css="", background=None, pad=0.0, label="HippoFit-Hippo", rounded=False):
    """pad: Anteil Rand pro Seite (für das maskierbare Icon). rounded: Hintergrund mit runden Ecken."""
    size = 200
    inner = size * (1 - 2 * pad)
    scale = inner / size
    bg = ""
    if background:
        bg = f"""<defs><linearGradient id="hfbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{background[0]}"/><stop offset="1" stop-color="{background[1]}"/></linearGradient></defs>
  <rect width="200" height="200" {'rx="44"' if rounded else ''} fill="url(#hfbg)"/>"""
    style = f"<style>{css}</style>" if css else ""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="{label}">
  {style}{bg}
  <g transform="translate({size * pad:.2f} {size * pad:.2f}) scale({scale:.4f})">{hippo_body()}
  </g>
</svg>
"""


def render_png(svg_text, px, out):
    chrome = next((c for c in CHROME_CANDIDATES if c.exists()), None)
    if not chrome:
        raise SystemExit("Chrome oder Edge nicht gefunden – PNGs können nicht gerendert werden.")
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "icon.html"
        page.write_text(f"""<!doctype html><html><head><style>
          html,body{{margin:0;padding:0;background:transparent;overflow:hidden}}
          svg{{display:block;width:{px}px;height:{px}px}}</style></head><body>{svg_text}</body></html>""", encoding="utf-8")
        subprocess.run([
            str(chrome), "--headless=new", "--disable-gpu", "--hide-scrollbars",
            f"--window-size={px},{px}", "--default-background-color=00000000",
            f"--user-data-dir={Path(tmp) / 'profile'}",
            f"--screenshot={out}", page.as_uri()
        ], check=True, capture_output=True, timeout=60)
    print("PNG", out.name, px)


if __name__ == "__main__":
    ICONS.mkdir(exist_ok=True)
    BG = ("#f6f1fc", "#e4dcf3")
    (ICONS / "hippo.svg").write_text(svg(BASE_CSS), encoding="utf-8")
    (ICONS / "hippo-anim.svg").write_text(svg(IDLE_CSS), encoding="utf-8")
    (ICONS / "hippo-flex.svg").write_text(svg(FLEX_CSS, label="Das Hippo jubelt"), encoding="utf-8")
    icon = svg(background=BG, pad=0.04, label="HippoFit", rounded=True)
    (ICONS / "icon.svg").write_text(icon, encoding="utf-8")
    render_png(icon, 192, ICONS / "icon-192.png")
    render_png(icon, 512, ICONS / "icon-512.png")
    render_png(svg(background=BG, pad=0.14), 512, ICONS / "icon-maskable-512.png")   # sichere Zone für runde Masken
    render_png(svg(background=BG, pad=0.06), 180, ICONS / "apple-touch-icon.png")     # iOS rundet selbst ab
    print("Fertig:", ICONS)
