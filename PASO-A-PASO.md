# Paso a paso — de cero a la app publicada

Tiempo estimado: 25 minutos. Solo necesitas navegador.

---

## PARTE A — Publicar la app (10 min)

La app **ya funciona** con las 80 personas de Ahedo sin tocar Firebase. Si solo quieres jugar, con esta parte basta. El ranking, eso sí, sería local de cada móvil.

### A1. Crear el repositorio

1. GitHub → botón **+** (arriba a la derecha) → **New repository**.
2. **Repository name**: `memoriafamiliar`
3. **Public** (obligatorio: GitHub Pages gratis solo publica repos públicos).
4. Marca **Add a README file**.
5. **Create repository**.

### A2. Subir los archivos

1. En el repo → **Add file** → **Upload files**.
2. Arrastra estos 9 archivos (todos a la raíz, sin carpeta):

   ```
   index.html   admin.html   db.js
   manifest.json   sw.js   icon-192.png   icon-512.png
   personas-ahedo.json   reglas-rtdb.json
   ```
3. Abajo → **Commit changes**.

### A3. Activar GitHub Pages

1. Repo → **Settings** (pestaña de arriba) → **Pages** (menú izquierdo).
2. **Source**: `Deploy from a branch`.
3. **Branch**: `main` · carpeta `/ (root)` → **Save**.
4. Espera 1-2 minutos y recarga esa página. Aparecerá la URL:

   ```
   https://cop1310.github.io/memoriafamiliar/
   ```

Ya juega. Ábrela en el móvil → menú de Chrome → **Añadir a pantalla de inicio** y queda instalada como app.

---

## PARTE B — Firebase, para el ranking compartido (15 min)

Sin esto, cada móvil tiene su propio ranking y las altas del administrador no se comparten.

### B1. Crear el proyecto

1. Entra en la consola de Firebase con tu cuenta de Google.
2. **Crear un proyecto** → nombre `memoria-familiar` → puedes desactivar Google Analytics → **Crear**.

### B2. Crear la base de datos

1. Menú izquierdo → **Compilación** → **Realtime Database** → **Crear base de datos**.
   > Ojo: **Realtime Database**, NO *Firestore*. Son productos distintos y la app usa el primero.
2. Ubicación: **europe-west1** (Bélgica).
3. Modo de seguridad: elige **modo bloqueado**. Las reglas buenas las pones en B5.

### B3. Copiar la configuración a `db.js`

1. Rueda dentada (arriba izquierda) → **Configuración del proyecto**.
2. Abajo, en *Tus apps*, pulsa el icono **`</>`** (Web).
3. Alias: `memoria` → **Registrar app**.
4. Te muestra un bloque `const firebaseConfig = { ... }`. **Cópialo entero.**
5. En GitHub, abre `db.js` → icono del **lápiz** (Edit) → pega los valores dentro de `FIREBASE_CONFIG`:

   ```js
   export const FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "memoria-familiar.firebaseapp.com",
     databaseURL: "https://memoria-familiar-default-rtdb.europe-west1.firebasedatabase.app",
     projectId: "memoria-familiar",
     storageBucket: "memoria-familiar.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123:web:abc"
   };
   ```
   > **`databaseURL` es la clave.** Si falta esa línea, la app sigue en modo demo. Firebase a veces no la incluye en el bloque que te enseña: cógela de la cabecera de Realtime Database.
6. **Commit changes**.

### B4. Importar las 80 personas

1. Firebase → **Realtime Database** → pestaña **Datos**.
2. Menú **⋮** (tres puntos, a la derecha del nodo raíz) → **Importar JSON**.
3. Selecciona `personas-ahedo.json` → **Importar**.
4. Debe aparecer el nodo `personas` con 80 hijos.

### B5. Poner las reglas de seguridad

1. Pestaña **Reglas**.
2. Borra lo que haya y pega el contenido íntegro de `reglas-rtdb.json`.
3. **Publicar**.

Con estas reglas: cualquiera **lee** las personas y **escribe** su marca en el ranking, pero **nadie puede modificar las personas ni borrar marcas** sin ser administrador.

### B6. Crear el administrador

1. Firebase → **Compilación** → **Authentication** → **Comenzar**.
2. **Sign-in method** → habilita **Correo electrónico/contraseña** → **Guardar**.
3. Pestaña **Users** → **Agregar usuario** → tu correo y una contraseña → **Agregar**.
4. Copia el **UID** que aparece en la fila del usuario (una cadena larga).
5. Vuelve a **Realtime Database** → **Datos** → sitúate en la raíz → **+** y crea:

   ```
   admins
     └── (pega aquí el UID)  →  true      (tipo booleano, no el texto "true")
   ```

Sin esto, `admin.html` podrá leer pero no guardará: las reglas rechazarán la escritura.

---

## Mantenimiento

### Cada vez que cambies un archivo

Sube el archivo **y edita `sw.js`**, subiendo la versión:

```js
const VERSION = "mf-v1";   →   const VERSION = "mf-v2";
```

Ese número es lo único que obliga a Chrome en Android a tirar la caché vieja. Si no lo cambias, la gente seguirá viendo la versión anterior por mucho que recargue: es exactamente el problema que ya has sufrido en tus otras apps.

### Añadir personas

Desde `admin.html` (en tu web, no en Firebase). Orden: **primero los mayores** (sin padres, solo pareja), después los hijos, así los desplegables ya tienen a quién ofrecer.

### Borrar el ranking (empezar temporada)

Firebase → Realtime Database → Datos → nodo `ranking` → **⋮** → **Eliminar**. Las personas no se tocan.

---

## Si algo no va

| Síntoma | Causa casi segura |
|---|---|
| Sigue diciendo "Modo demo" | Falta `databaseURL` en `FIREBASE_CONFIG` |
| El ranking no guarda | No pegaste las reglas, o falta el índice `".indexOn": ["seg"]` |
| El admin no guarda | Tu UID no está en `admins`, o el valor está como texto en vez de booleano |
| La web no se actualiza en el móvil | No subiste `VERSION` en `sw.js` |
| 404 en la URL de Pages | El repo es privado, o los archivos están dentro de una carpeta en vez de en la raíz |
