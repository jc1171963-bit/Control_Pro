# Imágenes del catálogo LURIMA

Cómo se guardan, se asocian y se comparten las imágenes de los productos de la tienda.

## 1. Dónde están

| Tipo | Ubicación | ¿En Git? | Quién la crea |
|---|---|---|---|
| Fotos ilustrativas de stock (Unsplash, WebP 800×800) | `frontend/public/assets/products/{nombre}.webp` | Sí | Se agregan a mano |
| Manifiesto foto ↔ producto | `frontend/src/lib/fotosIlustrativas.ts` | Sí | Se edita a mano |
| Ilustraciones SVG y cuadros del giro 360° | `backend/uploads/publicos/{slug}-{n}.svg`, `{slug}-{n}-giro-{kk}.svg` | **No** (`backend/uploads/*` está en `.gitignore`) | `flask seed-demo` |
| Fotos reales subidas desde el panel | `backend/uploads/publicos/` | No | Panel de administración |

## 2. Cómo se asocian con los productos

- La base de datos guarda solo rutas relativas: `producto_imagen.url = /api/archivos/publicos/{slug}-{n}.svg`
  y `producto_giro.frames`. Nunca rutas de un equipo ni Base64.
- Al mostrar una imagen, `fotoIlustrativa()` toma el **slug** de esa URL y busca la foto de stock en el manifiesto.
  Si existe, la muestra en lugar del SVG. Así funciona en el inicio, las tarjetas, la búsqueda, el detalle, la galería
  y la animación del carrito.
- Una foto real subida (jpg, png, webp) siempre gana a la de stock.
- En el detalle, si el producto tiene foto de stock se abre en la foto. El giro 360° (siluetas generadas) queda como miniatura.
- Cada entrada del manifiesto tiene:
  - `slug`: nombre del archivo `.webp` y slug del catálogo prototipo anterior, que se conserva para bases antiguas.
  - `productos`: slugs del catálogo actual (`backend/seeds/catalogo.py`) que muestran esa foto.

Asociaciones vigentes (catálogo de 50 productos):

| Foto | Productos |
|---|---|
| `bata-clinica-clasica.webp` | `bata-caballero` |
| `bata-de-laboratorio-antifluidos.webp` | `bata-dama` |
| `camisa-de-trabajo-manga-larga.webp` | `camisa-de-mezclilla-construccion-grande` |
| `polo-corporativa-pique.webp` | `playera-polo-verde`, `blusa-polo-verde` |
| `filipina-quirurgica.webp` | `conjunto-quirurgico-azul-marino-dama` |
| `pantalon-quirurgico.webp` | `quirurgico-verde-femenino` |
| `botas-de-seguridad-dielectricas.webp` | `botas-mantenimiento` |
| `pantalon-de-trabajo-cargo`, `chaleco-de-alta-visibilidad`, `gorra-de-trabajo`, `mandil-de-intendencia` | Ninguno: no hay producto con esa prenda o color. Solo aplican a su slug prototipo. |

Los demás productos muestran su ilustración SVG.

**Por qué no se registra la foto en la base de datos:** el manifiesto está versionado y usa el slug, que no cambia.
Basta un `git pull` para que las fotos aparezcan, también en una base ya sembrada, sin seeds ni migraciones.

## 3. Entorno nuevo

```bash
git pull
docker compose up -d db                     # o un PostgreSQL propio
cd backend
python -m venv .venv && .venv\Scripts\activate    # Linux/macOS: source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env                      # Linux/macOS: cp; ajusta DATABASE_URL y las claves
flask --app wsgi db upgrade
flask --app wsgi seed-demo                  # crea los 50 productos, sus referencias y los SVG en uploads/
flask --app wsgi run
# otra terminal
cd frontend && npm install && npm run dev
```

## 4. Después de un `git pull` en un entorno existente

- **Si la base ya tiene el catálogo de 50 productos:** no hay que hacer nada. Recarga la página.
- **Si `seed-demo` responde "La base ya tiene datos"**, es lo esperado: el seed no duplica ni sobrescribe.
- **Si la base tiene el catálogo prototipo de 12 productos (slugs como `bata-clinica-clasica`):** las fotos se siguen
  viendo, pero ese catálogo ya no coincide con el del repositorio. Para tener el mismo catálogo que el resto del equipo
  hay que volver a crear la base. **Esto borra los datos locales.** Haz un respaldo antes y hazlo solo si estás de acuerdo:

  ```bash
  docker compose down -v        # borra el volumen de la base
  docker compose up -d db
  cd backend && flask --app wsgi db upgrade && flask --app wsgi seed-demo
  ```

## 5. Agregar una foto nueva

1. Confirma la licencia y que la foto muestre la prenda y el color del producto, sin marcas ni logotipos de terceros.
2. Conviértela a WebP 800×800 y nómbrala en minúsculas con guiones: `frontend/public/assets/products/{nombre}.webp`.
3. Agrega una entrada en `fotosIlustrativas.ts` con `slug: '{nombre}'`, `productos: ['{slug-del-producto}']`,
   el id de la foto, el autor y una descripción.
4. Ejecuta `npm test` en `frontend/`. La prueba `fotosilustrativas.test.tsx` falla si el archivo no existe o si el slug
   no está en `backend/seeds/catalogo.py`.

## 6. Cómo evitar referencias rotas

- Usa solo rutas relativas: `/assets/...` en el frontend y `/api/archivos/publicos/...` en la base. Nunca `C:\Users\...`.
- No subas `backend/uploads/` a Git. Los SVG se regeneran con `seed-demo`.
- Si cambias el nombre de un producto del seed, cambia también su slug en el manifiesto. La prueba lo detecta.
