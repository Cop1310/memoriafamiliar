# Memoria Familiar

Juego de memoria en el que las parejas no son fotos iguales, sino **parentescos**: hermanos, padre/hijo, pareja sentimental o tríos padre-madre-hijo. Las cartas muestran el **nombre** (la foto es opcional y se activa sola cuando la cargas).

PWA estática. GitHub Pages + Firebase Realtime Database.

---

## Puesta en marcha

1. Repositorio nuevo (p. ej. `memory-familia`) → subir estos archivos a la raíz → **Settings › Pages › Deploy from branch › main / (root)**.
2. Firebase → crear proyecto → **Realtime Database** → copiar el `firebaseConfig` y pegarlo en `FIREBASE_CONFIG` (arriba de `db.js`).
3. Firebase › Realtime Database › **Reglas** → pegar `reglas-rtdb.json`.
4. Firebase › Authentication → activar el proveedor que uses y crear el usuario administrador. Después, en la base de datos, añadir a mano:
   ```
   admins/{uid-del-admin}: true
   ```
5. `sw.js`: **subir `VERSION` en cada despliegue** (`mf-v1` → `mf-v2`…). Es lo que evita el problema de caché de Chrome en Android.

Mientras `FIREBASE_CONFIG` esté vacío, la app arranca en **modo demo** con 39 personas de ejemplo y guarda en `localStorage`. Sirve para probar sin tocar nada.

---

## Modelo de datos

```
/personas/{id} = {
  nombre,         // obligatorio y ÚNICO (sin foto, es la única pista de la carta)
  sexo,           // 'H' | 'M'  → necesario para el trío y para decir "padre"/"madre"
  padreId,        // opcional
  madreId,        // opcional
  parejaId,       // opcional, siempre bidireccional (se fuerza al guardar)
  grupoHermanos,  // opcional, EXCEPCIÓN: hermanos cuyos padres no están en la base
  foto            // opcional, dataURL 320×320 JPEG (~35 KB)
}
```

**Hermanos e hijos no se guardan: se deducen.** Hermanos = comparten `padreId` o `madreId`. Hijos = invertir la referencia.

`grupoHermanos` es la única excepción, y existe por un caso real: los cinco hermanos Pérez mayores (Saturnino, Celia, Emilio, Miguel Ángel, María Jesús) son hermanos, pero sus padres no están en la base y no tiene sentido inventárselos —aparecerían como cartas fantasma en los modos padre/hijo y trío—. Misma etiqueta de grupo = hermanos. Úsalo solo cuando no haya padres que registrar.

---

## La regla que hace que el juego sea correcto

El generador de tablero cumple dos invariantes (`db.js`, `tableroValido()`):

1. **Cada persona aparece como máximo una vez** en el tablero.
2. **No existe ninguna combinación de cartas del tablero, distinta de las elegidas, que también sea una pareja o un trío válido.**

La segunda es la importante y la que casi nadie contempla. Ejemplo: cuatro hermanos en el tablero formando dos parejas → el jugador junta al hermano 1 con el 3, tiene razón, y el juego le dice que ha fallado. El generador prueba hasta 400 barajados y descarta cualquier tablero ambiguo.

Capacidad medida con las 80 personas de Ahedo (invariantes verificados, 20 tableros por combinación):

| Modo | Máx. grupos | Tamaño máximo jugable |
|---|---|---|
| La misma persona | 80 | 15 parejas · 30 cartas ✓ |
| Pareja | 22 | 15 parejas · 30 cartas ✓ |
| Hermanos | 19 | 15 parejas · 30 cartas ✓ |
| Padre / hijo | 18 | 15 parejas · 30 cartas ✓ |
| Trío familiar | 14 | 7 tríos · 21 cartas ✓ |

**Los cinco modos llegan al tablero máximo.** El modo padre/hijo es el que más capacidad consume: si en el tablero están César y su padre Jacinto, César ya **no puede** coincidir con Gonzalo ni con Adrián (sus hijos) ni con Celia (su madre), porque esas cartas también serían pareja válida. Aun así quedan 18 grupos disponibles.

---

## Ranking

Un ranking **independiente por cada combinación de modo y tamaño**: `personal_4`, `hermanos_12`, `trio_7`… Son 5 modos × 5 tamaños (3 en trío) = **23 clasificaciones**.

```
/ranking/{modo}_{n}/{pushId} = { jugador, seg, intentos, ts }
```

Se ordena por **tiempo**; los intentos solo desempatan. La consulta usa `orderByChild("seg") + limitToFirst(20)`, por eso las reglas incluyen `".indexOn": ["seg"]` (sin el índice, Firebase se descargaría el nodo entero y ordenaría en cliente).

Las reglas permiten **crear** una marca sin login, pero no editarla ni borrarla (`".write": "!data.exists()"`), y validan tipo y rango de cada campo. Aun así, el juego es cliente: alguien con la consola abierta puede publicar un tiempo falso. Si eso llega a importar, la solución es login anónimo + validar en el servidor, no más reglas.

---

## Archivos

| Archivo | Qué hace |
|---|---|
| `db.js` | Config, acceso a RTDB, parentescos, generador de tablero, capacidad |
| `index.html` | Juego |
| `admin.html` | Alta/edición de personas + panel de capacidad por modo |
| `sw.js` / `manifest.json` | PWA instalable y offline |
| `reglas-rtdb.json` | Reglas de seguridad (lectura pública, escritura solo admin) |

## Pendiente antes de usarlo con gente real

- **Consentimiento de imagen** cuando actives las fotos, y muy especialmente si hay menores del club.
- La lectura de `/personas` es pública (el juego la necesita sin login). Si los datos no deben ser públicos, hay que exigir `auth != null` también en `.read` y meter un login anónimo o por invitación.
