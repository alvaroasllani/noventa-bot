# AGENT.md — 90 Bot

## Descripción

90 Bot es una aplicación web cliente para preparar publicaciones inmobiliarias
en Marketplace y WhatsApp. Permite buscar inmuebles, filtrar su planificación,
descargar fotografías y copiar los textos ya preparados.

El archivo principal de entrada es el CSV exportado con nombres como
`inmuebles (2).csv`. `scripts/update-excel.js` lo convierte a `data.json`, que
es el formato interno consumido por la interfaz.

## Esquema del CSV de Noventa

Columnas esperadas:

```text
codigo, planificador, dia planificado, consignador, direccion, activo, zona, tipo,
precio, texto facebook 1, texto facebook 2, texto facebook 3,
texto whatsapp, imagenes
```

Los textos de Facebook y WhatsApp pueden contener comas, saltos de línea,
caracteres Unicode y emojis. Deben conservarse sin reformatearlos.

Prefijos de código:

```text
AL → ALQUILER
VN → VENTA
PV → PREVENTA
AN → ANTICRETICO
PE → ENTREGA INMEDIATA
AX → ALQUILER TEMPORAL
```

`planificador` llega como `LISTA 1`, `LISTA 2` o `LISTA 3`. Internamente se
guarda también como el número 1, 2 o 3. Los días `Miercoles` y `Sabado` se
normalizan a `Miércoles` y `Sábado` para coincidir con los filtros visibles.

Una fila es publicable cuando `activo` es `true` y además tiene código reconocido
e imágenes. Las filas inactivas o incompletas permanecen en `data.json`, pero
`34Af3` queda en `no` y no se muestran en búsquedas, filtros ni descargas.

## Adaptación interna

`data-adapter.js` es la fuente única de verdad para leer y normalizar este CSV.
Se usa desde Node.js y directamente en el navegador al cargar un archivo
manual. Campos internos relevantes:

```text
codigo → código original completo, por ejemplo AL3
mERYr → operación normalizada
oHoAu → tipo
WIoeb → zona
5kIsO → título derivado de tipo y dirección
GRkSW / UOFib → importe y moneda separados
0C9DE / 7fYNu → portada y galería
vDBia → texto WhatsApp
abzcW → texto Facebook 1, con respaldo en 2 y 3
textoFacebook1/2/3 → las tres variantes originales
planificador / UZGXo → número de lista
diaPlanificador / a6X7r → día normalizado
consignador → consignador del CSV
```

El CSV no contiene Oficina ni Equipo. La interfaz oculta automáticamente esos
filtros cuando no existen valores, pero mantiene compatibilidad con archivos
antiguos que sí los incluyan.

Cuando un inmueble contiene más de un texto de Facebook, la ficha muestra un
selector compacto 1–3. La variante elegida se conserva mientras la app está
abierta y es la que usan tanto `Copiar FB` como la acción de compartir en
Facebook.

## Actualización

Uso local:

```text
node scripts/update-excel.js "inmuebles (2).csv"
```

Sin argumento, el script toma el archivo `inmuebles*.csv` local más reciente.
En GitHub Actions puede descargar el archivo más reciente desde Drive usando
`DRIVE_FOLDER_ID`, `DRIVE_FILE_ID` y opcionalmente `DRIVE_API_KEY` como
secretos. No debe configurarse una carpeta heredada por defecto.

## Validación

```text
node tests/inmuebles-adapter.test.js
node tests/filters.test.js
node --check app.js
node --check data-adapter.js
node --check scripts/update-excel.js
```

## Archivos principales

- `index.html`, `app.js`, `styles.css`: aplicación web.
- `data-adapter.js`: parser y normalización compartidos.
- `inmuebles (2).csv`: exportación de origen actual.
- `data.json`: catálogo generado para producción.
- `scripts/update-excel.js`: actualización local/Drive.
- `.github/workflows/sync-excel.yml`: sincronización automática.

## Convenciones

- El usuario principal trabaja desde Android y prioriza rapidez y simpleza.
- No alterar los textos de publicación ni eliminar saltos de línea o emojis.
- Mantener la estructura visual compacta y evitar agregar ruido a las fichas.
- Preservar compatibilidad con Excel/JSON salvo que se solicite retirarla.
