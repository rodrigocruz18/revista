# Revista Tenis — Flipbook Digital Premium

Sitio de lectura para la revista de tenis, construido para sentirse como una
revista física digitalizada (flipbook realista, lupa, zoom, voz, búsqueda,
miniaturas, modo lectura, marcadores) sin backend, base de datos ni login.
Cada edición mensual es un PDF en `/public/magazines`; el sitio detecta solo
cuál es la edición actual.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 ·
PDF.js · react-pageflip · Web Speech API · localStorage. 100% client-side
para la lectura; sin Supabase, sin base de datos, sin API propia.

## Primeros pasos

```bash
npm install
npm run dev
```

Abre `http://localhost:3000/revista`. Si `/public/magazines` está vacío
verás el mensaje "No hay ediciones disponibles" — agrega un PDF (ver más
abajo) y refresca.

```bash
npm run build
npm run start
```

`npm run dev` y `npm run build` regeneran automáticamente
`src/data/magazines.json` antes de arrancar (hooks `predev`/`prebuild` en
`package.json`), así que nunca hay que tocarlo a mano.

## Publicar una edición nueva

1. Copia el PDF a `/public/magazines/` con el nombre `YYYY-MM-cualquier-cosa.pdf`,
   por ejemplo `2026-09-revista-tenis.pdf`. Detalle del formato en
   `public/magazines/README.md`.
2. (Opcional) agrega una portada en `public/magazines/covers/2026-09.jpg`.
3. `git commit && git push`.
4. Vercel construye solo; `/revista` pasa a mostrar la edición nueva y la
   anterior queda disponible en su propia URL (`/revista/2026-08`). No hay
   que tocar código ni el manifest.

## Estructura

```
src/
  app/                    rutas: / (redirect), /revista, /revista/[edition], /archivo
  components/
    flipbook/             HTMLFlipBook (react-pageflip) + render de páginas vía PDF.js
    reader/                orquestador (Reader.tsx), capa de texto, búsqueda, voz, modo lectura
    tools/                 toolbar, lupa, zoom, miniaturas, pantalla completa
    archive/                grilla de ediciones anteriores
    ui/                     preloader, estado de error
  lib/                     pdf.ts (motor PDF.js), magazines.ts, reader-storage.ts (localStorage),
                            speech.ts, keyboard.ts, utils.ts
  data/magazines.json      generado — no editar a mano
  config/magazine.ts       nombre/branding centralizados
scripts/
  generate-magazine-manifest.ts   arma el manifest a partir de /public/magazines
  copy-pdf-worker.ts              copia el worker de PDF.js a /public/pdf-worker
  dev/make-sample-pdf.py          SOLO desarrollo: genera un PDF de prueba (requiere Python + reportlab)
```

## Funciones incluidas en este MVP

Flipbook con portada, doble página en escritorio y página única en móvil
(cambia solo según el ancho disponible), swipe/touch/teclado/mouse, zoom
(100%–400%) que vuelve a renderizar la página a mayor resolución en vez de
escalarla por CSS, lupa cuadrada flotante con una fuente de alta resolución
independiente (no es un `transform: scale`), texto seleccionable y copiable
extraído con PDF.js, búsqueda de texto completo con acentos/mayúsculas
normalizados y salto a la página + resaltado, panel de miniaturas con carga
perezosa, lectura en voz alta (Web Speech API) con velocidad ajustable y
lectura de la selección, modo lectura con tipografía/interlineado/ancho
configurables y tema claro/oscuro, modo noche y "reducir animaciones",
pantalla completa, atajos de teclado, marcadores y progreso de lectura por
edición en `localStorage`, URL por página (`?p=27`) y por edición
(`/revista/2026-08`), compartir vía Web Share API con fallback a portapapeles,
y un archivo histórico con todas las ediciones.

## Simplificaciones deliberadas del MVP

- **Traducir / Explicar / preguntas a la IA**: aparecen en el menú contextual
  como "próximamente" pero no llaman a ningún modelo — quedan ahí para que
  sea evidente dónde se conectarían más adelante (ver sección 45 del brief).
- **OCR**: si un PDF no trae texto seleccionable (por ejemplo, páginas
  escaneadas como imagen), la búsqueda/voz/selección simplemente no
  encontrarán texto en esa página. La arquitectura ya extrae texto por
  página vía `manager.getTextContent()`, así que agregar OCR después es
  cuestión de alimentar esa misma función, no de rediseñar nada.
- **Portadas**: no se generan miniaturas de portada automáticamente durante
  el build (added complexity para poco beneficio en el MVP); si querés una
  portada real en `/archivo`, poné la imagen en
  `public/magazines/covers/YYYY-MM.jpg` y se usa sola.
- **Zoom + flipbook simultáneos**: al pasar de 100%, el flipbook se
  reemplaza por una vista de una sola página con scroll/pan (en vez de
  intentar hacer zoom sobre el efecto de pasar página, que con las libs
  disponibles se vuelve frágil). Doble clic o volver a 100% restaura el
  flipbook normal.

## Notas de despliegue

- Listo para Vercel: push a GitHub, importar el repo, sin variables de
  entorno ni servicios externos que configurar.
- Las fuentes (Inter, Playfair Display) se cargan con `next/font/google`, lo
  que requiere que el entorno de build tenga salida a internet — Vercel la
  tiene por defecto.
