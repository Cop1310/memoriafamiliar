/* ============================================================
   MEMORY FAMILIA — capa de datos y motor de tablero
   ============================================================
   Modelo de persona (RTDB, nodo /personas/{id}):
     { nombre, sexo:'H'|'M', padreId, madreId, parejaId, grupoHermanos, foto }
   - hermanos  -> se DERIVAN (mismo padreId o mismo madreId)
   - grupoHermanos -> EXCEPCIÓN: hermanos cuyos padres no están en la base.
     Misma etiqueta = hermanos. Úsalo solo cuando no haya padres que registrar.
   - hijos     -> se DERIVAN (invirtiendo padreId/madreId)
   - parejaId  -> siempre bidireccional (se fuerza al guardar)
   - foto      -> opcional (dataURL base64). Si falta, la carta usa el nombre.
   ============================================================ */

/* ---------- 1. CONFIGURACIÓN FIREBASE -----------------------
   Pega aquí el firebaseConfig de tu proyecto.
   Si lo dejas vacío, la app arranca en MODO DEMO (datos de ejemplo
   en memoria/localStorage). Útil para probar sin tocar Firebase.  */
export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const USAR_FIREBASE = !!FIREBASE_CONFIG.databaseURL;

/* ---------- 2. MODOS DE JUEGO ------------------------------ */
export const MODOS = {
  personal:  { etiqueta: "La misma persona", grupo: 2, color: "amb",  pista: "Empareja cada persona consigo misma." },
  hermanos:  { etiqueta: "Hermanos",         grupo: 2, color: "verd", pista: "Empareja hermanos (comparten padre o madre)." },
  padrehijo: { etiqueta: "Padre / hijo",     grupo: 2, color: "viol", pista: "Empareja cada persona con su padre o su madre." },
  pareja:    { etiqueta: "Pareja",           grupo: 2, color: "rosa", pista: "Empareja a cada persona con su pareja." },
  trio:      { etiqueta: "Trío familiar",    grupo: 3, color: "azul", pista: "Reúne padre, madre e hijo. Voltea tres cartas." }
};

export const TAMANOS_PAREJA = [4, 6, 8, 12, 15];   //  8 / 12 / 16 / 24 / 30 cartas
export const TAMANOS_TRIO   = [5, 6, 7];           // 15 / 18 / 21 cartas

/* ---------- 3. CARGA / GUARDADO ---------------------------- */
let _fb = null;

async function firebase() {
  if (_fb) return _fb;
  const [{ initializeApp }, rtdb] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js")
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  _fb = { db: rtdb.getDatabase(app), ...rtdb };
  return _fb;
}

const LS_KEY = "memoriaFamiliar.demo";
let _demo = null;

function demoPersonas() {
  if (_demo) return _demo;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { _demo = JSON.parse(raw); return _demo; }
  } catch (e) { /* localStorage no disponible: seguimos en memoria */ }
  _demo = semilla();
  return _demo;
}

function guardarDemo() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(_demo)); } catch (e) {}
}

export async function cargarPersonas() {
  if (!USAR_FIREBASE) return { ...demoPersonas() };
  const { db, ref, get, child } = await firebase();
  const snap = await get(child(ref(db), "personas"));
  return snap.exists() ? snap.val() : {};
}

export async function guardarPersona(id, persona) {
  const p = { ...persona };
  ["padreId", "madreId", "parejaId", "grupoHermanos", "foto"].forEach(k => { if (!p[k]) delete p[k]; });

  if (!USAR_FIREBASE) {
    const d = demoPersonas();
    d[id] = p;
    // pareja bidireccional
    Object.keys(d).forEach(k => { if (d[k].parejaId === id && k !== p.parejaId) delete d[k].parejaId; });
    if (p.parejaId && d[p.parejaId]) d[p.parejaId].parejaId = id;
    guardarDemo();
    return;
  }
  const { db, ref, update, get, child } = await firebase();
  const todas = (await get(child(ref(db), "personas"))).val() || {};
  const cambios = { [`personas/${id}`]: p };
  Object.keys(todas).forEach(k => {
    if (todas[k].parejaId === id && k !== p.parejaId) cambios[`personas/${k}/parejaId`] = null;
  });
  if (p.parejaId) cambios[`personas/${p.parejaId}/parejaId`] = id;
  await update(ref(db), cambios);
}

export async function borrarPersona(id) {
  if (!USAR_FIREBASE) {
    const d = demoPersonas();
    delete d[id];
    Object.values(d).forEach(p => {
      ["padreId", "madreId", "parejaId"].forEach(k => { if (p[k] === id) delete p[k]; });
    });
    guardarDemo();
    return;
  }
  const { db, ref, update, get, child } = await firebase();
  const todas = (await get(child(ref(db), "personas"))).val() || {};
  const cambios = { [`personas/${id}`]: null };
  Object.entries(todas).forEach(([k, p]) => {
    ["padreId", "madreId", "parejaId"].forEach(campo => {
      if (p[campo] === id) cambios[`personas/${k}/${campo}`] = null;
    });
  });
  await update(ref(db), cambios);
}

export const nuevoId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const esDemo = () => !USAR_FIREBASE;

/* ---------- 3bis. RANKING ---------------------------------
   Un ranking independiente por combinación modo + nº de grupos:
   /ranking/{modo}_{n}/{pushId} = { jugador, seg, intentos, ts }
   Se ordena por TIEMPO (seg); los intentos solo desempatan.
   ----------------------------------------------------------- */
export const claveTablero = (modo, n) => `${modo}_${n}`;
const LS_RANK = "memoriaFamiliar.ranking";

function rankingLocal() {
  try { return JSON.parse(localStorage.getItem(LS_RANK) || "{}"); } catch (e) { return {}; }
}

export async function guardarMarca(modo, n, marca) {
  const clave = claveTablero(modo, n);
  const m = { jugador: String(marca.jugador).slice(0, 24), seg: marca.seg, intentos: marca.intentos };
  if (!USAR_FIREBASE) {
    const r = rankingLocal();
    (r[clave] = r[clave] || []).push({ ...m, ts: Date.now() });
    try { localStorage.setItem(LS_RANK, JSON.stringify(r)); } catch (e) {}
    return;
  }
  const { db, ref, push, set, serverTimestamp } = await firebase();
  await set(push(ref(db, `ranking/${clave}`)), { ...m, ts: serverTimestamp() });
}

export async function cargarRanking(modo, n, limite = 20) {
  const clave = claveTablero(modo, n);
  let arr;
  if (!USAR_FIREBASE) {
    arr = rankingLocal()[clave] || [];
  } else {
    const { db, ref, get, query, orderByChild, limitToFirst } = await firebase();
    const snap = await get(query(ref(db, `ranking/${clave}`), orderByChild("seg"), limitToFirst(limite)));
    arr = snap.exists() ? Object.values(snap.val()) : [];
  }
  return arr.sort((a, b) => a.seg - b.seg || a.intentos - b.intentos).slice(0, limite);
}

/* ---------- 4. PARENTESCOS --------------------------------- */
export const sonHermanos = (a, b) =>
  a.id !== b.id && (
    (!!a.padreId && a.padreId === b.padreId) ||
    (!!a.madreId && a.madreId === b.madreId) ||
    (!!a.grupoHermanos && a.grupoHermanos === b.grupoHermanos)
  );

export const esProgenitorDe = (p, h) => h.padreId === p.id || h.madreId === p.id;

export const sonPareja = (a, b) =>
  a.id !== b.id && a.parejaId === b.id && b.parejaId === a.id;

/** ¿Existe relación del modo entre dos personas distintas? */
export function relacionados(modo, a, b) {
  if (a.id === b.id) return false;
  switch (modo) {
    case "personal":  return false;
    case "hermanos":  return sonHermanos(a, b);
    case "padrehijo": return esProgenitorDe(a, b) || esProgenitorDe(b, a);
    case "pareja":    return sonPareja(a, b);
    default:          return false;
  }
}

/** ¿Estas 3 personas forman padre + madre + hijo? */
export function esTrio(a, b, c) {
  for (const [h, x, y] of [[a, b, c], [b, a, c], [c, a, b]]) {
    if (!h.padreId || !h.madreId) continue;
    const padres = new Set([h.padreId, h.madreId]);
    if (padres.has(x.id) && padres.has(y.id) && x.id !== y.id) return true;
  }
  return false;
}

/* ---------- 5. GENERADOR DE TABLERO -------------------------
   Dos invariantes que HAY que cumplir o el juego es incorrecto:
   (I1) Cada persona aparece como máximo una vez en el tablero.
   (I2) No existe ninguna combinación de cartas del tablero, distinta
        de los grupos elegidos, que también sea una pareja/trío válida.
   (I2) es la que se olvida siempre. Ejemplo: 4 hermanos en el tablero
   formando 2 parejas -> A-C también sería "hermanos" y el jugador
   acertaría, pero el juego le diría que ha fallado.
   ------------------------------------------------------------ */

const barajar = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[x[i], x[j]] = [x[j], x[i]]; } return x; };

/** Lista de todos los grupos candidatos (pares o tríos) del modo. */
export function gruposCandidatos(modo, lista) {
  const g = [];
  if (modo === "personal") return lista.map(p => [p, p]);
  if (modo === "trio") {
    const porId = new Map(lista.map(p => [p.id, p]));
    for (const h of lista) {
      const pa = porId.get(h.padreId), ma = porId.get(h.madreId);
      if (pa && ma) g.push([h, pa, ma]);
    }
    return g;
  }
  for (let i = 0; i < lista.length; i++)
    for (let j = i + 1; j < lista.length; j++)
      if (relacionados(modo, lista[i], lista[j])) g.push([lista[i], lista[j]]);
  return g;
}

/** Validación completa (I2) por fuerza bruta. Coste máximo: C(21,3)=1330. */
function tableroValido(modo, grupos) {
  if (modo === "personal") return true;
  const cartas = grupos.flat();
  const grupoDe = new Map();
  grupos.forEach((g, k) => g.forEach(p => grupoDe.set(p.id, k)));

  if (modo === "trio") {
    for (let i = 0; i < cartas.length; i++)
      for (let j = i + 1; j < cartas.length; j++)
        for (let k = j + 1; k < cartas.length; k++) {
          const mismo = grupoDe.get(cartas[i].id) === grupoDe.get(cartas[j].id)
                     && grupoDe.get(cartas[j].id) === grupoDe.get(cartas[k].id);
          if (!mismo && esTrio(cartas[i], cartas[j], cartas[k])) return false;
        }
    return true;
  }
  for (let i = 0; i < cartas.length; i++)
    for (let j = i + 1; j < cartas.length; j++) {
      const mismo = grupoDe.get(cartas[i].id) === grupoDe.get(cartas[j].id);
      if (!mismo && relacionados(modo, cartas[i], cartas[j])) return false;
    }
  return true;
}

/**
 * Genera un tablero de n grupos. Devuelve array de grupos (cada grupo = array de personas)
 * o null si la base de datos no da para tanto.
 */
export function generarTablero(modo, n, personas) {
  const lista = Object.entries(personas).map(([id, p]) => ({ id, ...p }));

  if (modo === "personal") {
    if (lista.length < n) return null;
    return barajar(lista).slice(0, n).map(p => [p, p]);
  }

  const candidatos = gruposCandidatos(modo, lista);
  for (let intento = 0; intento < 400; intento++) {
    const usados = new Set();
    const sel = [];
    for (const g of barajar(candidatos)) {
      if (g.some(p => usados.has(p.id))) continue;
      const prueba = [...sel, g];
      if (!tableroValido(modo, prueba)) continue;
      sel.push(g);
      g.forEach(p => usados.add(p.id));
      if (sel.length === n) return sel;
    }
  }
  return null;
}

/** Máximo nº de grupos que admite la BD en este modo (para bloquear tamaños imposibles). */
export function capacidad(modo, personas) {
  const lista = Object.entries(personas).map(([id, p]) => ({ id, ...p }));
  if (modo === "personal") return lista.length;
  const candidatos = gruposCandidatos(modo, lista);
  let mejor = 0;
  for (let intento = 0; intento < 60; intento++) {
    const usados = new Set(); const sel = [];
    for (const g of barajar(candidatos)) {
      if (g.some(p => usados.has(p.id))) continue;
      const prueba = [...sel, g];
      if (!tableroValido(modo, prueba)) continue;
      sel.push(g); g.forEach(p => usados.add(p.id));
    }
    if (sel.length > mejor) mejor = sel.length;
  }
  return mejor;
}

/** Texto de la relación de un grupo acertado (se muestra al emparejar). */
export function etiquetaRelacion(modo, grupo) {
  const [a, b, c] = grupo;
  switch (modo) {
    case "personal":  return "la misma persona";
    case "hermanos":  return "hermanos";
    case "pareja":    return "pareja";
    case "trio":      return "padre · madre · hijo";
    case "padrehijo": {
      const prog = esProgenitorDe(a, b) ? a : b;
      const hijo = prog === a ? b : a;
      const rel = prog.sexo === "M" ? "madre" : "padre";
      return `${prog.nombre} es ${rel} de ${hijo.nombre}`;
    }
  }
  return "";
}

/* ---------- 6. PERSONAS DE AHEDO ---------------------------
   80 personas generadas desde GENTE_AHEDO.docx.
   Se usan tal cual mientras FIREBASE_CONFIG esté vacío.
   Para pasar a Firebase: importar personas-ahedo.json en la consola de RTDB.
   ----------------------------------------------------------- */
function semilla() {
  return {
  emilio_perez: { nombre:"Emilio Pérez", sexo:"H", parejaId:"angelines_benito", grupoHermanos:"perez_mayores" },
  angelines_benito: { nombre:"Angelines Benito", sexo:"M", parejaId:"emilio_perez" },
  raul_perez: { nombre:"Raúl Pérez", sexo:"H", padreId:"emilio_perez", madreId:"angelines_benito", parejaId:"araceli_sanchez" },
  hector_perez: { nombre:"Héctor Pérez", sexo:"H", padreId:"emilio_perez", madreId:"angelines_benito", parejaId:"mari_mar_lopez" },
  angel_luis_perez: { nombre:"Ángel Luis Pérez", sexo:"H", padreId:"emilio_perez", madreId:"angelines_benito", parejaId:"noemi_sanchez" },
  araceli_sanchez: { nombre:"Araceli Sánchez", sexo:"M", parejaId:"raul_perez" },
  nico_perez: { nombre:"Nico Pérez", sexo:"H", padreId:"raul_perez", madreId:"araceli_sanchez" },
  martin_perez: { nombre:"Martín Pérez", sexo:"H", padreId:"raul_perez", madreId:"araceli_sanchez" },
  yago_perez: { nombre:"Yago Pérez", sexo:"H", padreId:"raul_perez", madreId:"araceli_sanchez" },
  mari_mar_lopez: { nombre:"Mari Mar López", sexo:"M", parejaId:"hector_perez" },
  gabri_perez: { nombre:"Gabri Pérez", sexo:"H", padreId:"hector_perez", madreId:"mari_mar_lopez" },
  noemi_sanchez: { nombre:"Noemí Sánchez", sexo:"M", parejaId:"angel_luis_perez" },
  samuel_perez: { nombre:"Samuel Pérez", sexo:"H", padreId:"angel_luis_perez", madreId:"noemi_sanchez" },
  daniel_perez: { nombre:"Daniel Pérez", sexo:"H", padreId:"angel_luis_perez", madreId:"noemi_sanchez" },
  jacinto_ortiz: { nombre:"Jacinto Ortiz", sexo:"H", parejaId:"celia_perez" },
  celia_perez: { nombre:"Celia Pérez", sexo:"M", parejaId:"jacinto_ortiz", grupoHermanos:"perez_mayores" },
  david_ortiz: { nombre:"David Ortiz", sexo:"H", padreId:"jacinto_ortiz", madreId:"celia_perez", parejaId:"sonia_puente" },
  cesar_ortiz: { nombre:"César Ortiz", sexo:"H", padreId:"jacinto_ortiz", madreId:"celia_perez", parejaId:"yolanda_pena" },
  daniel_ortiz: { nombre:"Daniel Ortiz", sexo:"H", padreId:"jacinto_ortiz", madreId:"celia_perez", parejaId:"sofia_fernandez" },
  sonia_puente: { nombre:"Sonia Puente", sexo:"M", parejaId:"david_ortiz" },
  alejandro_ortiz: { nombre:"Alejandro Ortiz", sexo:"H", padreId:"david_ortiz", madreId:"sonia_puente" },
  irene_ortiz: { nombre:"Irene Ortiz", sexo:"M", padreId:"david_ortiz", madreId:"sonia_puente" },
  yolanda_pena: { nombre:"Yolanda Peña", sexo:"M", parejaId:"cesar_ortiz" },
  gonzalo_ortiz: { nombre:"Gonzalo Ortiz", sexo:"H", padreId:"cesar_ortiz", madreId:"yolanda_pena" },
  adrian_ortiz: { nombre:"Adrián Ortiz", sexo:"H", padreId:"cesar_ortiz", madreId:"yolanda_pena" },
  sofia_fernandez: { nombre:"Sofía Fernández", sexo:"M", parejaId:"daniel_ortiz" },
  vega_ortiz: { nombre:"Vega Ortiz", sexo:"M", padreId:"daniel_ortiz", madreId:"sofia_fernandez" },
  emma_ortiz: { nombre:"Emma Ortiz", sexo:"M", padreId:"daniel_ortiz", madreId:"sofia_fernandez" },
  miguel_macias: { nombre:"Miguel Macías", sexo:"H", parejaId:"merche_perez" },
  merche_perez: { nombre:"Merche Pérez", sexo:"M", parejaId:"miguel_macias" },
  eva_macias: { nombre:"Eva Macías", sexo:"M", padreId:"miguel_macias", madreId:"merche_perez", parejaId:"carlos_fernandez" },
  luis_mari_macias: { nombre:"Luis Mari Macías", sexo:"H", padreId:"miguel_macias", madreId:"merche_perez", parejaId:"chus" },
  sergio_macias: { nombre:"Sergio Macías", sexo:"H", padreId:"miguel_macias", madreId:"merche_perez" },
  carlos_fernandez: { nombre:"Carlos Fernández", sexo:"H", parejaId:"eva_macias" },
  naira_fernandez: { nombre:"Naira Fernández", sexo:"M", padreId:"carlos_fernandez", madreId:"eva_macias" },
  alba_fernandez: { nombre:"Alba Fernández", sexo:"M", padreId:"carlos_fernandez", madreId:"eva_macias" },
  chus: { nombre:"Chus", sexo:"M", parejaId:"luis_mari_macias" },
  inigo_macias: { nombre:"Iñigo Macías", sexo:"H", padreId:"luis_mari_macias", madreId:"chus" },
  naiara_macias: { nombre:"Naiara Macías", sexo:"M", padreId:"luis_mari_macias", madreId:"chus" },
  aner_macias: { nombre:"Aner Macías", sexo:"H", padreId:"sergio_macias" },
  mari_carmen_perez: { nombre:"Mari Carmen Pérez", sexo:"M", parejaId:"jose_manuel_martinez" },
  jose_manuel_martinez: { nombre:"José Manuel Martínez", sexo:"H", parejaId:"mari_carmen_perez" },
  raul_martinez: { nombre:"Raúl Martínez", sexo:"H", padreId:"jose_manuel_martinez", madreId:"mari_carmen_perez" },
  miriam_martinez: { nombre:"Miriam Martínez", sexo:"M", padreId:"jose_manuel_martinez", madreId:"mari_carmen_perez" },
  mari_cruz_martinez: { nombre:"Mari Cruz Martínez", sexo:"M", parejaId:"jose_gonzalez" },
  jose_gonzalez: { nombre:"José González", sexo:"H", parejaId:"mari_cruz_martinez" },
  roberto_gonzalez: { nombre:"Roberto González", sexo:"H", padreId:"jose_gonzalez", madreId:"mari_cruz_martinez", parejaId:"rocio" },
  joseba_gonzalez: { nombre:"Joseba González", sexo:"H", padreId:"jose_gonzalez", madreId:"mari_cruz_martinez", parejaId:"marta_moreno" },
  aitor_gonzalez: { nombre:"Aitor González", sexo:"H", padreId:"jose_gonzalez", madreId:"mari_cruz_martinez" },
  rocio: { nombre:"Rocío", sexo:"M", parejaId:"roberto_gonzalez" },
  marta_gonzalez: { nombre:"Marta González", sexo:"M", padreId:"roberto_gonzalez", madreId:"rocio" },
  luis_gonzalez: { nombre:"Luis González", sexo:"H", padreId:"roberto_gonzalez", madreId:"rocio" },
  marta_moreno: { nombre:"Marta Moreno", sexo:"M", parejaId:"joseba_gonzalez" },
  oier_gonzalez: { nombre:"Oier González", sexo:"H", padreId:"joseba_gonzalez", madreId:"marta_moreno" },
  marcelino_criado: { nombre:"Marcelino Criado", sexo:"H", parejaId:"txiki" },
  txiki: { nombre:"Txiki", sexo:"M", parejaId:"marcelino_criado" },
  yolanda_criado: { nombre:"Yolanda Criado", sexo:"M", padreId:"marcelino_criado", madreId:"txiki", parejaId:"inaki" },
  javi_txiki: { nombre:"Javi Txiki", sexo:"H", padreId:"marcelino_criado", madreId:"txiki", parejaId:"mari_jose" },
  mariascen: { nombre:"Mariascen", sexo:"M", padreId:"marcelino_criado", madreId:"txiki", parejaId:"rizos" },
  inaki: { nombre:"Iñaki", sexo:"H", parejaId:"yolanda_criado" },
  inaxio: { nombre:"Inaxio", sexo:"H", padreId:"inaki", madreId:"yolanda_criado" },
  mari_jose: { nombre:"Mari José", sexo:"M", parejaId:"javi_txiki" },
  aritz: { nombre:"Aritz", sexo:"H", padreId:"javi_txiki", madreId:"mari_jose", parejaId:"andrea" },
  urko: { nombre:"Urko", sexo:"H", padreId:"javi_txiki", madreId:"mari_jose" },
  andrea: { nombre:"Andrea", sexo:"M", parejaId:"aritz" },
  rizos: { nombre:"Rizos", sexo:"H", parejaId:"mariascen" },
  alex: { nombre:"Álex", sexo:"H", padreId:"rizos", madreId:"mariascen" },
  ismael_perez: { nombre:"Ismael Pérez", sexo:"H", parejaId:"juani" },
  juani: { nombre:"Juani", sexo:"M", parejaId:"ismael_perez" },
  ismaelito: { nombre:"Ismaelito", sexo:"H", padreId:"ismael_perez", madreId:"juani" },
  david_perez: { nombre:"David Pérez", sexo:"H", padreId:"ismael_perez", madreId:"juani" },
  javier_perez: { nombre:"Javier Pérez", sexo:"H", padreId:"ismael_perez", madreId:"juani", parejaId:"ana" },
  abraham_perez: { nombre:"Abraham Pérez", sexo:"H", padreId:"david_perez" },
  luis_perez: { nombre:"Luis Pérez", sexo:"H", padreId:"david_perez" },
  ana: { nombre:"Ana", sexo:"M", parejaId:"javier_perez" },
  aitana: { nombre:"Aitana", sexo:"M", padreId:"javier_perez", madreId:"ana" },
  sofia: { nombre:"Sofía", sexo:"M", padreId:"javier_perez", madreId:"ana" },
  saturnino_perez: { nombre:"Saturnino Pérez", sexo:"H", grupoHermanos:"perez_mayores" },
  miguel_angel_perez: { nombre:"Miguel Ángel Pérez", sexo:"H", grupoHermanos:"perez_mayores" },
  maria_jesus_perez: { nombre:"María Jesús Pérez", sexo:"M", grupoHermanos:"perez_mayores" }
  };
}
