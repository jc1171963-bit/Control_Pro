"""Sucursales que solicitan uniformes (cuentas cliente-empresa), organizadas por división, zona y estado.

Transcritas de la estructura de sucursales de la empresa. En la fuente solo "Noroeste" trae nombre; las otras cinco
franjas (#N/D) se asignan a Norte, Bajío, Centro, Sur y Centroamérica según las zonas que agrupan.

La dirección de cada sucursal no viene en la fuente: se carga una dirección PROVISIONAL (estado y código postal de
referencia del estado) marcada "por capturar", que el aprobador corrige desde Sucursales.
"""

NOROESTE, NORTE, BAJIO, CENTRO, SUR, CENTROAMERICA = "Noroeste", "Norte", "Bajío", "Centro", "Sur", "Centroamérica"

# (división, zona, responsable de zona, [(estado, [sucursales])])
ESTRUCTURA = [
    # ---------------------------------------------------------------- franja 1 (Noroeste)
    (NOROESTE, "Baja California", None, [
        ("Baja California", ["Ensenada", "Ensenada Loma Dorada", "Rosarito", "Tijuana", "Tijuana Casa Blanca", "Tijuana Centro",
                             "Tijuana Matamoros", "Tijuana Otay"])]),
    (NOROESTE, "Mexicali Frontera", None, [
        ("Baja California", ["Mexicali", "Mexicali Lázaro Cárdenas", "Mexicali Pedregal", "Tijuana Cucapah"]),
        ("Baja California Sur", ["La Paz"]),
        ("Sonora", ["San Luis Río Colorado"])]),
    (NOROESTE, "Sonora", None, [
        ("Sonora", ["Hermosillo", "Hermosillo Morelos", "Hermosillo Palo Verde", "Hermosillo Solidaridad", "Navojoa", "Nogales",
                    "Obregón"])]),
    (NOROESTE, "Sinaloa Centro", None, [
        ("Sinaloa", ["Culiacán Cañadas", "Culiacán Colegio Militar", "Culiacán La Conquista", "Culiacán Nakayama",
                     "Culiacán Universitarios", "Mazatlán"])]),
    (NOROESTE, "Sinaloa", None, [
        ("Sinaloa", ["Culiacán", "Culiacán Las Torres", "Guamúchil Centro", "Guasave", "Los Mochis", "Los Mochis Los Álamos",
                     "Los Mochis Rosales", "Navolato"])]),
    # ---------------------------------------------------------------- franja 2
    (NORTE, "Nuevo León Metropolitana", "Jesús Martínez Gómez", [
        ("Nuevo León", ["Apodaca Plaza Citadina", "Apodaca Plaza Huinalá", "Apodaca San Miguel", "Cadereyta Jiménez", "Guadalupe",
                        "Guadalupe Av. Juárez", "Juárez", "Monterrey La Fe", "San Nicolás de los Garza", "San Nicolás Plaza Opción"])]),
    (NORTE, "Nuevo León", None, [
        ("Nuevo León", ["Escobedo Plaza Los Girasoles", "García", "Monterrey", "Monterrey Centrika", "Monterrey Lázaro Cárdenas",
                        "Monterrey Lincoln", "Monterrey San Bernabé", "Santa Catarina"])]),
    (NORTE, "Tamaulipas", None, [
        ("San Luis Potosí", ["Ciudad Valles"]),
        ("Tamaulipas", ["Ciudad Victoria", "Matamoros", "Nuevo Laredo", "Reynosa", "Tampico"])]),
    (NORTE, "Aguascalientes", None, [
        ("Aguascalientes", ["Aguascalientes", "Aguascalientes Universidad"]),
        ("San Luis Potosí", ["San Luis Potosí", "San Luis Potosí de Gálvez", "San Luis Potosí Muñoz"]),
        ("Zacatecas", ["Zacatecas", "Zacatecas Adolfo López Mateos"])]),
    (NORTE, "Chihuahua", None, [
        ("Chihuahua", ["Chihuahua", "Chihuahua Deportistas", "Chihuahua Nueva España", "Ciudad Juárez", "Ciudad Juárez Clouthier",
                       "Ciudad Juárez Gómez Morín", "Delicias"])]),
    (NORTE, "Laguna", None, [
        ("Coahuila", ["Saltillo", "Saltillo Norte", "Torreón", "Torreón Diagonal Reforma", "Torreón Plaza Triana"]),
        ("Durango", ["Durango", "Durango Domingo Arrieta", "Durango Juventud", "Gómez Palacio"])]),
    # ---------------------------------------------------------------- franja 3
    (BAJIO, "Jalisco Centro", None, [
        ("Colima", ["Colima", "Manzanillo"]),
        ("Jalisco", ["Guadalajara Américas", "Guadalajara Circunvalación", "Guadalajara Cristóbal Colón",
                     "Guadalajara Mariano Otero", "Guadalajara San Juan", "Guadalajara Tetlán", "Tlaquepaque"])]),
    (BAJIO, "Jalisco", None, [
        ("Jalisco", ["El Salto", "Puerto Vallarta", "Tlajomulco", "Tlajomulco Centro", "Tonalá Tonaltecas", "Zapopan Centro",
                     "Zapopan Las Águilas", "Zapotlanejo"]),
        ("Nayarit", ["Tepic"])]),
    (BAJIO, "Michoacán", None, [
        ("Michoacán", ["Morelia", "Morelia 3 Puentes", "Morelia Paseo de la República", "Uruapan", "Vista Hermosa", "Zamora"])]),
    (BAJIO, "Guanajuato", None, [
        ("Guanajuato", ["León", "León Campestre", "León Francisco Villa", "León Hidalgo", "León Obelisco", "León San Juan Bosco",
                        "León San Pedro", "León Torres Landa", "San Francisco del Rincón", "Silao"])]),
    (BAJIO, "Guanajuato Sur", None, [
        ("Guanajuato", ["Celaya", "Celaya Tecnológico", "Irapuato", "Irapuato Los Reyes", "Moroleón", "Salamanca"]),
        ("Querétaro", ["Corregidora El Pueblito"])]),
    (BAJIO, "Querétaro", None, [
        ("Hidalgo", ["Pachuca"]),
        ("Querétaro", ["Querétaro", "Querétaro Av. de la Luz", "Querétaro Ejército Republicano", "Querétaro Pie de la Cuesta",
                       "Querétaro Revolución", "Querétaro Sur", "San Juan del Río"])]),
    # ---------------------------------------------------------------- franja 4
    (CENTRO, "CDMX Norte", None, [
        ("Estado de México", ["Coacalco", "Cuautitlán", "Cuautitlán Izcalli", "Ecatepec", "Ecatepec Bicentenario",
                              "Ecatepec López Portillo", "Tecámac", "Tecámac Centro", "Tultitlán"])]),
    (CENTRO, "CDMX Oriente", None, [
        ("Estado de México", ["Chalco", "Chicoloapan", "Chimalhuacán", "Ixtapaluca", "Los Reyes-La Paz", "Nezahualcóyotl", "Texcoco",
                              "Valle de Chalco Tezozómoc"])]),
    (CENTRO, "CDMX Poniente", None, [
        ("Ciudad de México", ["Coyoacán", "Tlalpan"]),
        ("Estado de México", ["Atizapán de Zaragoza", "Huixquilucan", "Naucalpan", "Naucalpan San Mateo", "Nicolás Romero",
                              "Tlalnepantla", "Tlalnepantla Gustavo Baz", "Tlalnepantla Reyes Heroles"])]),
    (CENTRO, "CDMX Centro", None, [
        ("Ciudad de México", ["Gustavo A. Madero", "Gustavo A. Madero Cuautepec", "Gustavo A. Madero Plaza Misterios",
                              "Gustavo A. Madero Ticomán"]),
        ("Estado de México", ["Ciudad Azteca", "Río de los Remedios", "Valle de Guadalupe"])]),
    (CENTRO, "CDMX Centro II", None, [
        ("Ciudad de México", ["Azcapotzalco", "Cuajimalpa", "Cuauhtémoc", "Cuauhtémoc Insurgentes", "Iztacalco La Viga",
                              "Miguel Hidalgo", "Miguel Hidalgo Observatorio"])]),
    (CENTRO, "CDMX Sur I", None, [
        ("Ciudad de México", ["Álvaro Obregón", "Álvaro Obregón Portales", "Benito Juárez", "Coyoacán División Norte", "Culhuacán",
                              "Iztapalapa", "Iztapalapa Aztahuacán", "Iztapalapa Centro", "Iztapalapa Leyes de Reforma"])]),
    # ---------------------------------------------------------------- franja 5
    (SUR, "Guerrero", None, [
        ("Estado de México", ["Lerma de Villada", "Metepec", "Toluca", "Toluca Central"]),
        ("Guerrero", ["Acapulco", "Acapulco Diamante", "Acapulco El Coloso", "Acapulco Renacimiento"]),
        ("Morelos", ["Cuautla", "Cuernavaca", "Cuernavaca Plan de Ayala"])]),
    (SUR, "Puebla", None, [
        ("Oaxaca", ["Oaxaca"]),
        ("Puebla", ["Puebla Azcárate", "Puebla CAPU", "Puebla El Porvenir", "Puebla San Sebastián", "Tehuacán"]),
        ("Veracruz", ["Córdoba"])]),
    (SUR, "Puebla Sur", None, [
        ("Puebla", ["Puebla", "Puebla Azaleas", "Puebla Municipio Libre", "Puebla Xilotzingo", "San Andrés Cholula",
                    "San Martín Texmelucan", "San Pedro Cholula"]),
        ("Tlaxcala", ["Tlaxcala"])]),
    (SUR, "Veracruz", None, [
        ("Veracruz", ["Boca del Río", "Boca del Río Díaz Mirón", "Coatzacoalcos", "Poza Rica", "Veracruz", "Veracruz Norte",
                      "Veracruz Valente Díaz", "Xalapa", "Xalapa Lázaro Cárdenas"])]),
    (SUR, "Chiapas", None, [
        ("Chiapas", ["San Cristóbal de las Casas", "Tapachula", "Tuxtla Gutiérrez", "Tuxtla Gutiérrez 11 Norte",
                     "Tuxtla Gutiérrez 5ta Norte"]),
        ("Tabasco", ["Cárdenas", "Villahermosa Gregorio Méndez", "Villahermosa Tabasco"])]),
    (SUR, "Quintana Roo", None, [
        ("Campeche", ["Campeche"]),
        ("Quintana Roo", ["Cancún", "Cancún López Portillo", "Playa del Carmen"]),
        ("Yucatán", ["Mérida", "Mérida Altabrisa", "Mérida Buena Vista", "Mérida Canek"])]),
    # ---------------------------------------------------------------- franja 6
    (CENTROAMERICA, "Centroamérica", None, [
        ("Guatemala", ["Guatemala"]),
        ("Managua", ["Managua", "Nicaragua Rotonda Centroamérica"]),
        ("San Salvador", ["El Salvador"])]),
]

# Código postal de referencia por estado (para la dirección provisional y la asignación por cercanía).
CP_ESTADO = {
    "Baja California": "22000", "Baja California Sur": "23000", "Sonora": "83000", "Sinaloa": "80000", "Nuevo León": "64000",
    "Tamaulipas": "87000", "San Luis Potosí": "78000", "Aguascalientes": "20000", "Zacatecas": "98000", "Chihuahua": "31000",
    "Coahuila": "25000", "Durango": "34000", "Colima": "28000", "Jalisco": "44100", "Nayarit": "63000", "Michoacán": "58000",
    "Guanajuato": "36000", "Querétaro": "76000", "Hidalgo": "42000", "Estado de México": "50000", "Ciudad de México": "06000",
    "Guerrero": "39000", "Morelos": "62000", "Oaxaca": "68000", "Puebla": "72000", "Veracruz": "91000", "Tlaxcala": "90000",
    "Chiapas": "29000", "Tabasco": "86000", "Campeche": "24000", "Quintana Roo": "77500", "Yucatán": "97000",
    "Guatemala": "01001", "Managua": "10000", "San Salvador": "01101",
}

# Responsables divisionales (divisionales@salud-digna.org): división → (nombre, correo, teléfono)
DIVISIONES = {
    CENTROAMERICA: ("Carlos Alberto Torres Gallardo", "carlos.torres@salud-digna.org", "393 107 3867"),
    NORTE: ("Francisco Escobedo Quiñones", "francisco.escobedo@salud-digna.org", "561 987 5994"),
    CENTRO: ("Marco Antonio Loman Espinosa", "marco.loman@salud-digna.org", "561 855 8814"),
    SUR: ("Víctor Manuel Cuamani Tepox", "victor.cuamani@salud-digna.org", "222 662 2124"),
    NOROESTE: ("Gerardo Fernández Torres", "gerardo.fernandez@salud-digna.org", "667 316 4376"),
    BAJIO: ("Joel Alberto Sánchez Tesillo", "joel.sanchez@salud-digna.org", "558 601 3097"),
}

# Gerentes de zona (zonas@salud-digna.org): zona → (nombre, correo, teléfono). Nombre None = vacante.
GERENTES = {
    "Aguascalientes": ("Emilia Marisela Conde Meza", "emilia.meza@salud-digna.org", "449 279 1134"),
    "Baja California": ("Javier Durán Arroyo", "javier.duran@salud-digna.org", "664 169 4777"),
    "CDMX Centro": ("Fernando Andrés Neri Vázquez", "fernando.neri@salud-digna.org", "557 879 6903"),
    "CDMX Norte": ("Yadira Frontana Lozano", "yadira.frontana@salud-digna.org", "564 164 2402"),
    "CDMX Oriente": ("Paulo César Hernández Pérez", "paulo.hernandez@salud-digna.org", "554 110 5101"),
    "CDMX Poniente": ("Celia Laura Ayala del Castillo", "celia.ayala@salud-digna.org", "557 938 5643"),
    "CDMX Centro II": (None, None, "55 1914 4029"),
    "CDMX Sur I": ("Óscar Rafael Pérez Campos", "oscar.campos@salud-digna.org", "554 106 3598"),
    "Chiapas": ("Derwin Garrido Hernández", "derwin.garrido@salud-digna.org", "961 251 3374"),
    "Chihuahua": ("Emilio Amezcua Granados", "emilio.amezcua@salud-digna.org", "614 120 1310"),
    "Guanajuato": (None, None, "477 289 1873"),
    "Guanajuato Sur": ("Adanely Castañeda Quintana", "adanely.castaneda@salud-digna.org", "331 117 6125"),
    "Guerrero": ("Gabriela Almeida Flores", "gabriela.almeida@salud-digna.org", "722 828 4560"),
    "Jalisco": ("Juan Carlos Cárdenas Mora", "juan.cardenas@salud-digna.org", "442 423 8742"),
    "Jalisco Centro": ("Valeria Guadalupe Solís García", "valeria.solis@salud-digna.org", "331 218 5860"),
    "Laguna": ("Ángel Alfonso Palacios López", "alfonso.palacios@salud-digna.org", "871 117 4464"),
    "Mexicali Frontera": ("Luis Fernando Salas Vizcarra", "luis.salas@salud-digna.org", "686 243 2083"),
    "Michoacán": ("Carolina Aradia Hernández Soto", "carolina.hernandez@salud-digna.org", "443 468 6479"),
    "Nuevo León": ("Sergio Valero García", "sergio.valero@salud-digna.org", "813 471 9632"),
    "Nuevo León Metropolitana": ("Jesús Martínez Gómez", "jesus.martinez@salud-digna.org", "813 471 9082"),
    "Puebla": ("José Bacilio Monge García", "jose.monge@salud-digna.org", "221 208 9839"),
    "Puebla Sur": ("Blanca Yadira Balboa Campos", "blanca.balboa@salud-digna.org", "554 106 5882"),
    "Querétaro": ("Martha Carolina Puc Ledezma", "martha.puc@salud-digna.org", "442 281 3599"),
    "Quintana Roo": ("Mauro Matus Rodríguez", "mauro.matus@salud-digna.org", "999 271 8300"),
    "Sinaloa": ("Alicia Ibeth Armenta Aguilar", "ibeth.armenta@salud-digna.org", "812 861 4280"),
    "Sinaloa Centro": ("Mariana Avendaño Herrera", "mariana.avendano@salud-digna.org", "667 198 0292"),
    "Sonora": ("Jaciel Muñoz Vega", "jaciel.munoz@salud-digna.org", "662 395 9231"),
    "Tamaulipas": ("Ángel Vladimir Castillo González", "angel.castillo@salud-digna.org", "899 204 3746"),
    "Veracruz": ("Ana Karen Nájera Cortés", "ana.najera@salud-digna.org", "228 304 1259"),
}

# Domicilios reales disponibles: sucursal → (calle, número, colonia, CP, municipio, estado, entre calles)
DIRECCIONES = {
    "Corregidora El Pueblito": ("Av. Heroico Colegio Militar", "25", "El Pueblito", "76900", "Corregidora", "Querétaro",
                                "Entre calle Lorenzo Ángeles y calle El Paraíso"),
    "Puebla": ("Av. 2 Pte.", "909", "Centro Histórico", "72000", "Puebla", "Puebla", "Entre calle 1 Nte. y calle 9 Nte."),
    "Puebla Azaleas": ("Azaleas", "907", "San Ramón", "72490", "Puebla de Zaragoza", "Puebla", None),
    "Puebla Azcárate": ("Calle 24 Nte.", "6", "Resurgimiento Cd. Norte", "72373", "Puebla", "Puebla",
                        "Entre Av. 24 Nte. y Av. Don Juan de Palafox"),
    "Puebla CAPU": ("Blvd. Norte", "3860", "Las Cuartillas", "72050", "Puebla", "Puebla", "Entre Av. 36 Pte. y De la Pradera"),
    "Puebla El Porvenir": ("Av. 14 Ote.", "4815", "Agrícola Resurgimiento", "72370", "Puebla", "Puebla",
                           "Entre calle 50 Nte. y calle 52 Nte."),
    "Puebla Municipio Libre": ("Blvd. Municipio Libre", "547 Int. 6", "Jardín", "72474", "Puebla", "Puebla",
                               "Entre calle 5 Sur y calle 5-A Sur"),
    "Puebla San Sebastián": ("Blvd. Xonacatepec", "174", "Bosques de San Sebastián", "72310", "Puebla", "Puebla",
                             "Entre Av. de las Rosas y Blvd. Margaritas"),
    "Puebla Xilotzingo": ("Carretera a Valsequillo Km 26", "S/N", "Rincón de San Ignacio", "72594", "Puebla", "Puebla",
                          "Entre Puesta del Sol y Av. del JDN"),
}
