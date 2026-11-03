"""Catálogo de uniformes de Control Pro (50 productos).

Los nombres vienen de la lista de productos de la empresa. Precio, tallas, colores, puestos y descripciones son
PROVISIONALES: se corrigen desde el panel de administración (Catálogo) sin tocar este archivo.
"""

CATEGORIAS = [("Batas", "batas"), ("Camisas y blusas", "camisas-blusas"), ("Polos y playeras", "polos-playeras"),
              ("Quirúrgicos y filipinas", "quirurgicos"), ("Pantalones", "pantalones"),
              ("Chamarras, suéteres y chalecos", "abrigo"), ("Calzado", "calzado"),
              ("Protección", "proteccion"), ("Accesorios", "accesorios")]

# Puestos del canal corporativo (los productos autorizados por puesto no requieren excepción).
PUESTOS = ["Gerencia", "Administración", "Auditoría", "Recepción", "Staff", "Biomédica", "Enfermería",
           "Imagenología", "Soporte técnico", "Asesor óptico", "Mantenimiento", "Intendencia", "Almacén",
           "Construcción"]

ROPA = ["CH", "M", "G", "XG"]
ROPA_EXT = ["CH", "M", "G", "XG", "XXG"]
PANTALON = ["28", "30", "32", "34", "36", "38"]
CALZADO = ["23", "24", "25", "26", "27", "28", "29"]
GUANTE = ["CH", "M", "G"]
UNITALLA = ["Unitalla"]

AZUL_MARINO = ("Azul marino", "#1E3A5F")
NEGRO = ("Negro", "#1F2937")
GRIS = ("Gris", "#6B7280")
BLANCO = ("Blanco", "#F1F5F9")
COCOA = ("Cocoa", "#7B5B45")
VERDE = ("Verde", "#15803D")
NARANJA = ("Naranja", "#F97316")
AZUL = ("Azul", "#2563EB")
AZUL_CIELO = ("Azul cielo", "#7DB4E0")
VERDE_QX = ("Verde quirúrgico", "#0E7C66")
ROSA = ("Rosa", "#EC4899")
AMARILLO = ("Amarillo", "#EAB308")
ROJO = ("Rojo", "#B91C1C")
MEZCLILLA = ("Mezclilla", "#3B5B7F")
TURQUESA = ("Turquesa", "#0F9F94")
PLATA = ("Plata", "#A8B0BC")
AZUL_REY = ("Azul rey", "#1D4ED8")

GABARDINA = "Gabardina 65% poliéster, 35% algodón"
PIQUE = "Piqué 50% algodón, 50% poliéster"
ANTIFLUIDO = "Microfibra antifluidos"

PRODUCTOS = [
    # sku, nombre, categoría, silueta, precio, colores, tallas, puestos, destacado, descripción, material
    ("BLU-001", "Blusa azul marino BM", "camisas-blusas", "blusa", "380", [AZUL_MARINO], ROPA, ["Biomédica"], False,
     "Blusa de corte entallado para el área biomédica, con bolsa al pecho y bordado institucional.", GABARDINA),
    ("BOT-001", "Bota de seguridad de hule unisex", "calzado", "bota", "450", [NEGRO], CALZADO,
     ["Mantenimiento", "Intendencia", "Construcción"], False,
     "Bota impermeable de hule con suela antiderrapante, ideal para áreas húmedas y lavado.", "Hule PVC"),
    ("CAM-001", "Camisa azul marino BM", "camisas-blusas", "camisa", "280", [AZUL_MARINO], ROPA_EXT, ["Biomédica"], True,
     "Camisa de manga larga para el área biomédica, con dos bolsas al pecho y costuras reforzadas.", GABARDINA),
    ("CAM-002", "Camisa manga corta gerentes", "camisas-blusas", "camisa", "420", [BLANCO], ROPA_EXT, ["Gerencia"], False,
     "Camisa ejecutiva de manga corta con cuello italiano y bordado de gerencia.", "Popelina 100% algodón"),
    ("CAM-003", "Camisa gris manga larga", "camisas-blusas", "camisa", "360", [GRIS], ROPA_EXT,
     ["Administración", "Mantenimiento"], False, "Camisa de manga larga en gris, puños con botón y bolsa al pecho.", GABARDINA),
    ("CAM-004", "Camisa negra caballero", "camisas-blusas", "camisa", "380", [NEGRO], ROPA_EXT, ["Staff", "Recepción"], False,
     "Camisa negra de caballero con cuello clásico, ideal para atención y staff.", "Popelina stretch"),
    ("CHM-001", "Chamarra caballero PET CT", "abrigo", "chamarra", "890", [AZUL_MARINO], ROPA_EXT, ["Imagenología"], True,
     "Chamarra de caballero para el área de PET CT, con cierre frontal, forro térmico y bolsas laterales.",
     "Poliéster repelente al agua"),
    ("CHM-002", "Chamarra dama PET CT", "abrigo", "chamarra", "890", [AZUL_MARINO], ROPA, ["Imagenología"], False,
     "Chamarra de dama para el área de PET CT, corte entallado con forro térmico.", "Poliéster repelente al agua"),
    ("GUA-001", "Guante de jardinería unisex", "proteccion", "guante", "95", [VERDE], GUANTE, ["Intendencia", "Mantenimiento"],
     False, "Guante con palma recubierta de látex para trabajos de jardinería.", "Algodón con recubrimiento de látex"),
    ("GUA-002", "Guantes de mantenimiento", "proteccion", "guante", "120", [GRIS], GUANTE, ["Mantenimiento", "Almacén"], False,
     "Guante de uso rudo con refuerzo en palma, resistente a cortes leves.", "Nylon con recubrimiento de nitrilo"),
    ("TEN-001", "Tenis de seguridad", "calzado", "tenis", "980", [NEGRO], CALZADO,
     ["Mantenimiento", "Almacén", "Soporte técnico"], True,
     "Tenis de seguridad ligero con casquillo de policarbonato y suela antiderrapante.", "Textil técnico y sintético"),
    ("PAN-001", "Pantalón cargo negro", "pantalones", "pantalon", "420", [NEGRO], PANTALON,
     ["Mantenimiento", "Almacén", "Soporte técnico"], True,
     "Pantalón cargo con seis bolsas, rodillas reforzadas y pretina con elástico lateral.", "Gabardina 100% algodón"),
    ("PLA-001", "Playera naranja soporte técnico", "polos-playeras", "playera", "220", [NARANJA], ROPA_EXT,
     ["Soporte técnico"], False, "Playera cuello redondo de alta visibilidad para el equipo de soporte técnico.",
     "Algodón peinado 180 g"),
    ("QUI-001", "Quirúrgico verde femenino", "quirurgicos", "conjunto", "560", [VERDE_QX], ROPA, ["Enfermería"], False,
     "Conjunto quirúrgico de dama: filipina cuello V y pantalón con jareta.", ANTIFLUIDO),
    ("SUE-001", "Suéter gris caballero", "abrigo", "sueter", "520", [GRIS], ROPA_EXT,
     ["Gerencia", "Administración", "Recepción"], False, "Suéter de punto cuello V con puños y cintura acanalados.",
     "Acrílico antipilling"),
    ("SUE-002", "Suéter gris dama", "abrigo", "sueter", "520", [GRIS], ROPA, ["Gerencia", "Administración", "Recepción"],
     False, "Suéter de dama de punto fino, cuello V y corte entallado.", "Acrílico antipilling"),
    ("BAT-001", "Bata azul biomédica", "batas", "bata", "520", [AZUL], ROPA, ["Biomédica"], False,
     "Bata de manga larga para el área biomédica, con tres bolsas y cierre de broches.", GABARDINA),
    ("BAT-002", "Bata caballero", "batas", "bata", "480", [BLANCO], ROPA_EXT, ["Gerencia", "Enfermería", "Imagenología"], True,
     "Bata clínica de caballero, manga larga, solapa clásica y tres bolsas.", GABARDINA),
    ("BAT-003", "Bata dama", "batas", "bata", "480", [BLANCO], ROPA, ["Gerencia", "Enfermería", "Imagenología"], True,
     "Bata clínica de dama con corte entallado, manga larga y tres bolsas.", GABARDINA),
    ("BLU-002", "Blusa azul auditoría extra grande", "camisas-blusas", "blusa", "360", [AZUL_CIELO], ["XG"], ["Auditoría"],
     False, "Blusa de manga larga para el equipo de auditoría, talla extra grande.", "Popelina stretch"),
    ("BLU-003", "Blusa blanca", "camisas-blusas", "blusa", "340", [BLANCO], ROPA, ["Administración", "Recepción"], False,
     "Blusa blanca de manga larga con cuello camisero y botones al frente.", "Popelina stretch"),
    ("BLU-004", "Blusa cocoa", "camisas-blusas", "blusa", "340", [COCOA], ROPA, ["Recepción", "Staff"], False,
     "Blusa color cocoa de corte entallado para atención al público.", "Popelina stretch"),
    ("POL-001", "Blusa polo azul marino biomédica", "polos-playeras", "polo", "250", [AZUL_MARINO], ROPA, ["Biomédica"], True,
     "Blusa tipo polo de dama con cuello tejido y tres botones, para el área biomédica.", PIQUE),
    ("POL-002", "Blusa polo verde", "polos-playeras", "polo", "250", [VERDE], ROPA, ["Intendencia"], False,
     "Blusa tipo polo de dama en verde, tejido transpirable.", PIQUE),
    ("BOT-002", "Botas biomédica", "calzado", "bota", "860", [NEGRO], CALZADO, ["Biomédica"], False,
     "Bota de piel con casquillo y suela dieléctrica para el área biomédica.", "Piel flor entera"),
    ("BOT-003", "Botas mantenimiento", "calzado", "bota", "790", [NEGRO], CALZADO, ["Mantenimiento"], True,
     "Bota de uso rudo con casquillo de acero, suela antiderrapante y resistente a aceites.", "Piel flor entera"),
    ("CAM-005", "Camisa azul auditoría", "camisas-blusas", "camisa", "380", [AZUL_CIELO], ROPA_EXT, ["Auditoría"], False,
     "Camisa de manga larga para el equipo de auditoría, con bolsa al pecho.", "Popelina stretch"),
    ("CAM-006", "Camisa blanca", "camisas-blusas", "camisa", "360", [BLANCO], ROPA_EXT,
     ["Gerencia", "Administración", "Recepción"], False, "Camisa blanca de manga larga con cuello clásico.",
     "Popelina 100% algodón"),
    ("CAM-007", "Camisa cocoa", "camisas-blusas", "camisa", "360", [COCOA], ROPA_EXT, ["Recepción", "Staff"], False,
     "Camisa color cocoa de manga larga para atención al público.", "Popelina stretch"),
    ("CAM-008", "Camisa de mezclilla construcción grande", "camisas-blusas", "camisa", "410", [MEZCLILLA], ["G"],
     ["Construcción"], False, "Camisa de mezclilla de uso rudo con dos bolsas y costuras dobles, talla grande.",
     "Mezclilla 100% algodón"),
    ("POL-003", "Camisa polo azul marino biomédica", "polos-playeras", "polo", "290", [AZUL_MARINO], ROPA_EXT, ["Biomédica"],
     False, "Camisa tipo polo de caballero con cuello tejido y tres botones, para el área biomédica.", PIQUE),
    ("CHA-001", "Chaleco", "abrigo", "chaleco", "450", [AZUL_MARINO], ROPA_EXT, ["Administración", "Staff"], False,
     "Chaleco institucional con cierre frontal y bolsas laterales.", "Poliéster con forro"),
    ("CHA-002", "Chaleco caballero recepción", "abrigo", "chaleco", "450", [NEGRO], ROPA_EXT, ["Recepción"], False,
     "Chaleco de vestir para caballero de recepción, con botones al frente.", "Casimir poliéster-viscosa"),
    ("QUI-002", "Conjunto quirúrgico azul marino caballero", "quirurgicos", "conjunto", "620", [AZUL_MARINO], ROPA_EXT,
     ["Enfermería", "Biomédica"], True, "Conjunto quirúrgico de caballero: filipina cuello V y pantalón con jareta.", ANTIFLUIDO),
    ("QUI-003", "Conjunto quirúrgico azul marino dama", "quirurgicos", "conjunto", "620", [AZUL_MARINO], ROPA,
     ["Enfermería", "Biomédica"], False, "Conjunto quirúrgico de dama con corte entallado y pantalón con jareta.", ANTIFLUIDO),
    ("QUI-004", "Conjunto quirúrgico mastografía", "quirurgicos", "conjunto", "620", [ROSA], ROPA, ["Imagenología"], False,
     "Conjunto quirúrgico para el área de mastografía.", ANTIFLUIDO),
    ("POL-004", "Polo negra staff dama", "polos-playeras", "polo", "290", [NEGRO], ROPA, ["Staff"], False,
     "Blusa tipo polo negra para el staff, corte de dama.", PIQUE),
    ("FAJ-001", "Faja almacenista", "proteccion", "faja", "380", [NEGRO], ROPA, ["Almacén"], False,
     "Faja de soporte lumbar con tirantes ajustables para carga de mercancía.", "Neopreno y elástico reforzado"),
    ("FIL-001", "Filipina gris", "quirurgicos", "filipina", "330", [GRIS], ROPA, ["Enfermería", "Imagenología"], False,
     "Filipina cuello V con bolsa al pecho y tela antibacterial de secado rápido.", "Microfibra antibacterial"),
    ("MAN-001", "Mandil amarillo", "accesorios", "mandil", "180", [AMARILLO], UNITALLA, ["Intendencia"], False,
     "Mandil con peto, dos bolsas frontales y cintas ajustables. Unitalla.", "Poliéster resistente a manchas"),
    ("MAN-002", "Mandil rojo RPBI grande", "accesorios", "mandil", "220", [ROJO], ["G"], ["Intendencia"], False,
     "Mandil impermeable para manejo de residuos peligrosos biológico-infecciosos (RPBI), talla grande.",
     "PVC impermeable"),
    ("MAN-003", "Mandil verde intendencia grande", "accesorios", "mandil", "190", [VERDE], ["G"], ["Intendencia"], False,
     "Mandil con peto para el personal de intendencia, talla grande.", "Poliéster resistente a manchas"),
    ("MAS-001", "Mascada asesor óptico", "accesorios", "mascada", "150", [TURQUESA], UNITALLA, ["Asesor óptico"], False,
     "Mascada institucional para asesores ópticos. Unitalla.", "Satín de poliéster"),
    ("MAS-002", "Mascada color naranja", "accesorios", "mascada", "150", [NARANJA], UNITALLA,
     ["Asesor óptico", "Recepción"], False, "Mascada institucional en color naranja. Unitalla.", "Satín de poliéster"),
    ("MAS-003", "Mascada color verde", "accesorios", "mascada", "150", [VERDE], UNITALLA, ["Asesor óptico", "Recepción"],
     False, "Mascada institucional en color verde. Unitalla.", "Satín de poliéster"),
    ("PIN-001", "Pin institucional", "accesorios", "pin", "60", [PLATA], UNITALLA, PUESTOS, False,
     "Pin metálico con el logotipo institucional y broche de seguridad.", "Metal con acabado esmaltado"),
    ("PLA-002", "Playera polo verde", "polos-playeras", "polo", "260", [VERDE], ROPA_EXT, ["Intendencia", "Staff"], False,
     "Playera tipo polo de caballero en verde, tejido transpirable.", PIQUE),
    ("POL-005", "Polo negra staff", "polos-playeras", "polo", "290", [NEGRO], ROPA_EXT, ["Staff"], True,
     "Playera tipo polo negra para el staff, corte de caballero.", PIQUE),
    ("QUI-005", "Quirúrgico intendencia campus", "quirurgicos", "conjunto", "560", [AZUL_REY], ROPA_EXT, ["Intendencia"],
     False, "Conjunto tipo quirúrgico para el personal de intendencia del campus.", ANTIFLUIDO),
    ("ZAP-001", "Zapato de seguridad intendencia campus", "calzado", "calzado", "690", [NEGRO], CALZADO, ["Intendencia"],
     False, "Zapato de seguridad ligero con suela antiderrapante para el personal de intendencia del campus.",
     "Piel sintética lavable"),
]
