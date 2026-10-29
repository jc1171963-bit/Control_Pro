"""Ilustraciones SVG propias para el catálogo de prueba (sin fotos de terceros)."""

SILUETAS = {
    "bata": "M120 60 L160 48 Q200 70 240 48 L280 60 L330 120 L305 140 L285 118 L285 330 L115 330 L115 118 L95 140 L70 120 Z",
    "camisa": "M125 70 L170 52 Q200 75 230 52 L275 70 L325 120 L295 150 L270 128 L270 300 L130 300 L130 128 L105 150 L75 120 Z",
    "pantalon": "M140 55 L260 55 L275 330 L215 330 L200 150 L185 330 L125 330 Z",
    "chaleco": "M135 60 L175 50 L190 120 L210 120 L225 50 L265 60 L285 110 L285 300 L115 300 L115 110 Z",
    "calzado": "M90 250 L95 170 L170 170 L180 215 L285 235 Q320 245 320 275 L320 290 L90 290 Z",
    "gorra": "M110 220 Q115 120 200 115 Q285 120 290 220 Z M290 220 L340 235 Q345 250 320 252 L110 245 Z",
}
DETALLES = {
    "bata": '<line x1="200" y1="75" x2="200" y2="330" stroke="#0003" stroke-width="3"/>'
            '<rect x="135" y="230" width="45" height="38" rx="4" fill="#0001" stroke="#0002"/>'
            '<rect x="220" y="230" width="45" height="38" rx="4" fill="#0001" stroke="#0002"/>',
    "camisa": '<path d="M170 52 L200 95 L230 52" fill="none" stroke="#0003" stroke-width="3"/>'
              '<rect x="215" y="135" width="32" height="28" rx="3" fill="#0001" stroke="#0002"/>',
    "pantalon": '<line x1="200" y1="55" x2="200" y2="150" stroke="#0003" stroke-width="3"/>'
                '<rect x="140" y="55" width="120" height="16" fill="#0002"/>',
    "chaleco": '<rect x="115" y="200" width="170" height="16" fill="#fff8"/><rect x="115" y="240" width="170" height="16" fill="#fff8"/>',
    "calzado": '<rect x="90" y="278" width="230" height="12" fill="#0004"/><path d="M110 185 L160 185" stroke="#fff6" stroke-width="4"/>',
    "gorra": '<circle cx="200" cy="120" r="7" fill="#0003"/>',
}


def svg_producto(tipo: str, color_hex: str, etiqueta: str) -> str:
    silueta = SILUETAS.get(tipo, SILUETAS["camisa"])
    detalle = DETALLES.get(tipo, "")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="{etiqueta}">
<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1F5F9"/><stop offset="1" stop-color="#E2E8F0"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#f)"/>
<circle cx="330" cy="70" r="90" fill="#14B8A6" opacity=".08"/>
<ellipse cx="200" cy="345" rx="130" ry="12" fill="#0F172A" opacity=".08"/>
<path d="{silueta}" fill="{color_hex}" stroke="#0F172A" stroke-opacity=".25" stroke-width="2" stroke-linejoin="round"/>
{detalle}
<text x="22" y="380" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#142B4A" opacity=".55">CONTROL PRO</text>
</svg>"""
