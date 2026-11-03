"""Ilustraciones SVG propias para el catálogo (sin fotos de terceros).

`svg_producto` dibuja la prenda con iluminación de tela; con `angulo` distinto de 0 dibuja un cuadro del giro 360° de
demostración (la prenda se estrecha y gira sobre su eje). Son marcadores de posición: se sustituyen por fotografías
reales desde el panel de administración.
"""
import math

SILUETAS = {
    "bata": "M120 60 L160 48 Q200 70 240 48 L280 60 L330 120 L305 140 L285 118 L285 330 L115 330 L115 118 L95 140 L70 120 Z",
    "camisa": "M125 70 L170 52 Q200 75 230 52 L275 70 L325 120 L295 150 L270 128 L270 300 L130 300 L130 128 L105 150 L75 120 Z",
    "blusa": "M130 72 L172 54 Q200 80 228 54 L270 72 L318 120 L292 148 L266 128 L258 205 L272 300 L128 300 L142 205 "
             "L134 128 L108 148 L82 120 Z",
    "playera": "M128 72 L170 56 Q200 86 230 56 L272 72 L318 112 L290 146 L268 130 L268 305 L132 305 L132 130 L110 146 "
               "L82 112 Z",
    "polo": "M128 72 L172 56 L200 70 L228 56 L272 72 L318 112 L290 146 L268 130 L268 305 L132 305 L132 130 L110 146 L82 112 Z",
    "filipina": "M128 72 L170 56 L200 110 L230 56 L272 72 L316 114 L290 146 L268 130 L268 305 L132 305 L132 130 L110 146 "
                "L84 114 Z",
    "chamarra": "M124 66 L170 50 Q200 64 230 50 L276 66 L322 128 L304 268 L280 266 L288 150 L278 300 L122 300 L112 150 "
                "L120 266 L96 268 L78 128 Z",
    "sueter": "M126 70 L172 54 L200 100 L228 54 L274 70 L320 128 L302 272 L280 270 L286 152 L276 302 L124 302 L114 152 "
              "L120 270 L98 272 L80 128 Z",
    "chaleco": "M135 60 L175 50 L200 130 L225 50 L265 60 L285 110 L285 300 L115 300 L115 110 Z",
    "conjunto": "M140 45 L178 35 L200 72 L222 35 L260 45 L302 80 L284 102 L265 90 L265 200 L135 200 L135 90 L116 102 L98 80 Z "
                "M140 204 L260 204 L268 350 L218 350 L200 250 L182 350 L132 350 Z",
    "pantalon": "M140 55 L260 55 L275 330 L215 330 L200 150 L185 330 L125 330 Z",
    "calzado": "M90 250 L95 170 L170 170 L180 215 L285 235 Q320 245 320 275 L320 290 L90 290 Z",
    "bota": "M108 290 L112 110 L182 110 L188 226 L282 244 Q320 252 320 276 L320 290 Z",
    "tenis": "M86 288 Q88 222 120 206 L176 194 Q200 226 250 232 L296 240 Q324 248 324 272 L324 288 Z",
    "guante": "M150 330 L150 232 L130 172 L116 122 Q113 105 127 103 Q140 102 146 118 L162 165 L160 82 Q160 66 174 66 "
              "Q188 66 188 82 L190 160 L196 70 Q197 55 211 56 Q225 57 223 72 L218 162 L232 84 Q235 70 248 73 "
              "Q261 77 257 90 L244 172 L262 122 Q268 108 281 113 Q292 119 286 134 L256 232 L250 330 Z",
    "faja": "M66 196 Q200 164 334 196 L334 272 Q200 242 66 272 Z",
    "mandil": "M162 58 L238 58 L238 122 Q288 140 298 204 L288 340 L112 340 L102 204 Q112 140 162 122 Z",
    "mascada": "M78 118 Q200 172 322 118 L252 202 Q216 232 210 332 L190 332 Q184 232 148 202 Z",
    "pin": "M200 108 A92 92 0 1 1 199.9 108 Z",
}
DETALLES = {
    "bata": '<line x1="200" y1="75" x2="200" y2="330" stroke="#0003" stroke-width="3"/>'
            '<rect x="135" y="230" width="45" height="38" rx="4" fill="#0001" stroke="#0002"/>'
            '<rect x="220" y="230" width="45" height="38" rx="4" fill="#0001" stroke="#0002"/>'
            '<rect x="222" y="120" width="34" height="26" rx="3" fill="#0001" stroke="#0002"/>',
    "camisa": '<path d="M170 52 L200 95 L230 52" fill="none" stroke="#0003" stroke-width="3"/>'
              '<line x1="200" y1="95" x2="200" y2="300" stroke="#0002" stroke-width="2"/>'
              '<rect x="215" y="135" width="32" height="28" rx="3" fill="#0001" stroke="#0002"/>',
    "blusa": '<path d="M172 54 L200 96 L228 54" fill="none" stroke="#0003" stroke-width="3"/>'
             '<line x1="200" y1="96" x2="200" y2="300" stroke="#0002" stroke-width="2"/>',
    "playera": '<path d="M170 56 Q200 92 230 56" fill="none" stroke="#0003" stroke-width="5"/>',
    "polo": '<path d="M172 56 L186 92 L200 70 L214 92 L228 56" fill="#0001" stroke="#0003" stroke-width="2"/>'
            '<line x1="200" y1="70" x2="200" y2="122" stroke="#0003" stroke-width="2"/>'
            '<circle cx="200" cy="88" r="3" fill="#0004"/><circle cx="200" cy="106" r="3" fill="#0004"/>',
    "filipina": '<path d="M170 56 L200 110 L230 56" fill="none" stroke="#0003" stroke-width="4"/>'
                '<rect x="218" y="140" width="32" height="28" rx="3" fill="#0001" stroke="#0002"/>',
    "chamarra": '<line x1="200" y1="64" x2="200" y2="300" stroke="#0005" stroke-width="3" stroke-dasharray="4 3"/>'
                '<rect x="122" y="286" width="156" height="14" fill="#0002"/>'
                '<path d="M150 200 L180 200 M220 200 L250 200" stroke="#0003" stroke-width="3"/>',
    "sueter": '<path d="M172 54 L200 100 L228 54" fill="none" stroke="#0003" stroke-width="4"/>'
              '<rect x="124" y="286" width="152" height="16" fill="#0002"/>'
              '<path d="M124 290 L276 290 M124 296 L276 296" stroke="#0002" stroke-width="1"/>',
    "chaleco": '<line x1="200" y1="130" x2="200" y2="300" stroke="#0003" stroke-width="3"/>'
               '<circle cx="206" cy="160" r="3.5" fill="#0005"/><circle cx="206" cy="200" r="3.5" fill="#0005"/>'
               '<circle cx="206" cy="240" r="3.5" fill="#0005"/>'
               '<path d="M140 230 L172 226 M228 226 L260 230" stroke="#0003" stroke-width="3"/>',
    "conjunto": '<path d="M178 35 L200 72 L222 35" fill="none" stroke="#0003" stroke-width="3"/>'
                '<rect x="215" y="105" width="30" height="24" rx="3" fill="#0001" stroke="#0002"/>'
                '<rect x="140" y="204" width="120" height="12" fill="#0002"/>',
    "pantalon": '<line x1="200" y1="55" x2="200" y2="150" stroke="#0003" stroke-width="3"/>'
                '<rect x="140" y="55" width="120" height="16" fill="#0002"/>',
    "calzado": '<rect x="90" y="278" width="230" height="12" fill="#0004"/><path d="M110 185 L160 185" stroke="#fff6" stroke-width="4"/>',
    "bota": '<rect x="108" y="278" width="212" height="12" fill="#0004"/>'
            '<path d="M126 140 L170 140 M126 170 L170 170 M126 200 L172 200" stroke="#fff5" stroke-width="3"/>',
    "tenis": '<path d="M86 276 L324 276" stroke="#fff" stroke-opacity=".8" stroke-width="10"/>'
             '<path d="M140 210 L160 230 M156 204 L176 224 M172 200 L192 220" stroke="#fff8" stroke-width="3"/>'
             '<path d="M210 250 Q250 236 290 256" fill="none" stroke="#fff6" stroke-width="4"/>',
    "guante": '<rect x="150" y="300" width="100" height="30" fill="#0002"/>'
              '<path d="M150 232 Q200 250 256 232" fill="none" stroke="#0003" stroke-width="2"/>',
    "faja": '<path d="M120 200 L110 60 M280 200 L290 60" stroke="#0005" stroke-width="10"/>'
            '<rect x="170" y="200" width="60" height="48" rx="6" fill="#0002" stroke="#0003"/>',
    "mandil": '<path d="M162 58 Q200 10 238 58" fill="none" stroke="#0004" stroke-width="5"/>'
              '<rect x="140" y="240" width="50" height="44" rx="4" fill="#0001" stroke="#0002"/>'
              '<rect x="210" y="240" width="50" height="44" rx="4" fill="#0001" stroke="#0002"/>',
    "mascada": '<circle cx="200" cy="200" r="16" fill="#0002" stroke="#0003"/>'
               '<path d="M120 140 Q200 176 280 140" fill="none" stroke="#fff5" stroke-width="3"/>',
    "pin": '<circle cx="200" cy="200" r="70" fill="none" stroke="#fff8" stroke-width="5"/>'
           '<text x="200" y="216" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="800" '
           'fill="#142B4A" opacity=".7">CP</text>',
}
# Prendas asimétricas: al girar 180° se ven hacia el otro lado (las simétricas solo muestran la espalda).
ASIMETRICAS = {"calzado", "bota", "tenis"}


def svg_producto(tipo: str, color_hex: str, etiqueta: str, angulo: float = 0) -> str:
    silueta = SILUETAS.get(tipo, SILUETAS["camisa"])
    rad = math.radians(angulo)
    c, s = math.cos(rad), math.sin(rad)
    frente = c >= 0
    escala = 0.3 + 0.7 * abs(c)  # ancho aparente al girar sobre el eje vertical
    if tipo in ASIMETRICAS and not frente:
        escala = -escala
    detalle = DETALLES.get(tipo, "") if frente else ""
    luz = 0.5 + 0.35 * s  # el brillo se desplaza con el giro
    sombra = 0 if frente else 0.14
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="{etiqueta}">
<defs>
<linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F8FAFC"/><stop offset="1" stop-color="#E2E8F0"/></linearGradient>
<linearGradient id="l" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#000" stop-opacity=".22"/>
<stop offset="{max(0.05, luz - 0.2):.2f}" stop-color="#000" stop-opacity=".04"/>
<stop offset="{luz:.2f}" stop-color="#fff" stop-opacity=".28"/>
<stop offset="{min(0.95, luz + 0.2):.2f}" stop-color="#000" stop-opacity=".04"/>
<stop offset="1" stop-color="#000" stop-opacity=".26"/>
</linearGradient>
<clipPath id="p"><path d="{silueta}"/></clipPath>
</defs>
<rect width="400" height="400" fill="url(#f)"/>
<ellipse cx="200" cy="352" rx="{40 + 100 * abs(c) + 30 * abs(s):.0f}" ry="11" fill="#0F172A" opacity=".10"/>
<g transform="translate(200 0) scale({escala:.3f} 1) translate(-200 0)">
<path d="{silueta}" fill="{color_hex}" stroke="#0F172A" stroke-opacity=".28" stroke-width="2" stroke-linejoin="round"/>
{detalle}
<g clip-path="url(#p)"><rect x="40" y="0" width="320" height="400" fill="url(#l)"/>
<rect width="400" height="400" fill="#000" opacity="{sombra}"/></g>
</g>
<text x="22" y="380" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#142B4A" opacity=".55">CONTROL PRO</text>
</svg>"""


def cuadros_giro(tipo: str, color_hex: str, etiqueta: str, cuadros: int = 24) -> list[str]:
    """Cuadros del giro 360° de demostración, en sentido horario empezando de frente."""
    return [svg_producto(tipo, color_hex, f"{etiqueta} · {i * 360 // cuadros}°", i * 360 / cuadros) for i in range(cuadros)]
