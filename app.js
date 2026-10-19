"use strict";
// Repasa: fotos de páginas → resumen, esquema, tarjetas, test, preguntas de examen corregidas, traducción y plan de estudio.

const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
// Párrafos y listas con guiones (respuestas largas de la IA)
function mdBloque(s) {
  let html = "", enLista = false;
  for (const l of String(s || "").split("\n")) {
    const m = l.match(/^\s*[-•*]\s+(.*)/);
    if (m) {
      if (!enLista) (html += "<ul>"), (enLista = true);
      html += `<li>${md(m[1])}</li>`;
    } else {
      if (enLista) (html += "</ul>"), (enLista = false);
      if (l.trim()) html += `<p>${md(l.replace(/^#+\s*/, ""))}</p>`;
    }
  }
  return html + (enLista ? "</ul>" : "");
}
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const barajar = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- Fechas (día local, formato AAAA-MM-DD) ----------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoyISO = () => iso(new Date());
const aFecha = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 864e5);
const diasHasta = (s) => diasEntre(hoyISO(), s);
const sumarDias = (s, n) => { const d = aFecha(s); d.setDate(d.getDate() + n); return iso(d); };
const fechaBonita = (s) => aFecha(s).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const cuandoEs = (s) => { const n = diasHasta(s); return n === 0 ? "hoy" : n === 1 ? "mañana" : n < 0 ? "ya pasó" : `en ${n} días`; };

// ---------- Datos fijos ----------
const OBJETIVOS = {
  examen: { nombre: "Examen escrito", icono: "✍️" },
  test: { nombre: "Examen tipo test", icono: "✅" },
  presentacion: { nombre: "Presentación oral", icono: "🎤" },
  entender: { nombre: "Solo entenderlo", icono: "💡" },
};
const IDIOMAS = ["Español", "Inglés", "Francés", "Alemán", "Italiano", "Portugués", "Catalán", "Valenciano", "Gallego", "Euskera", "Rumano", "Árabe", "Chino"];
const ICONO_DATO = { fecha: "📅", formula: "🧮", cifra: "🔢", persona: "👤", lugar: "📍", regla: "📏", vocabulario: "🔤", otro: "📌" };
const TIPO_PREGUNTA = { definir: "Definir", explicar: "Explicar", relacionar: "Relacionar", comparar: "Comparar", aplicar: "Aplicar", ejercicio: "Ejercicio" };
const SUGERENCIAS = ["No entiendo lo más importante, explícamelo", "Ponme un ejemplo fácil", "Hazme 3 preguntas y corrígeme", "¿Qué es lo que más puede caer?"];
const MAX_FOTOS = 20;
const INTERVALO = [0, 1, 2, 4, 7, 15]; // días hasta volver a ver una tarjeta según su caja (1-5)
const VOZ = { Español: "es-ES", Inglés: "en-GB", Francés: "fr-FR", Alemán: "de-DE", Italiano: "it-IT", Portugués: "pt-PT", Catalán: "ca-ES", Valenciano: "ca-ES", Gallego: "gl-ES", Euskera: "eu-ES", Rumano: "ro-RO", Árabe: "ar-SA", Chino: "zh-CN" };
const COLORES = { violeta: "#5b4ee6", azul: "#2f6fe4", turquesa: "#0f8fa3", verde: "#12946a", rosa: "#d63c8f", naranja: "#e0661b" };
const EMOJIS = ["🦊", "🐱", "🐼", "🦄", "🐸", "🐧", "🦋", "🌸", "⭐", "🌙", "🔥", "🎧", "⚽", "🎨", "📚", "💜"];
const LOGROS = [
  { id: "tema1", icono: "📸", nombre: "Primer tema", desc: "Crear tu primer tema", ok: (s) => s.temas >= 1 },
  { id: "tema5", icono: "📚", nombre: "Biblioteca", desc: "Crear 5 temas", ok: (s) => s.temas >= 5 },
  { id: "traductora", icono: "🌍", nombre: "Traductora", desc: "Traducir un texto con fotos", ok: (s) => s.traducciones >= 1 },
  { id: "test1", icono: "✅", nombre: "Primer test", desc: "Terminar un test completo", ok: (s) => s.tests >= 1 },
  { id: "diez", icono: "🏆", nombre: "Un 10", desc: "Sacar un 10 en un test completo", ok: (s) => s.dieces >= 1 },
  { id: "tarjetas100", icono: "🃏", nombre: "100 tarjetas", desc: "Repasar 100 tarjetas", ok: (s) => s.tarjetas >= 100 },
  { id: "tarjetas500", icono: "🧠", nombre: "Memoria de elefante", desc: "Repasar 500 tarjetas", ok: (s) => s.tarjetas >= 500 },
  { id: "correccion1", icono: "✍️", nombre: "Primera corrección", desc: "Que te corrija una respuesta o un ejercicio", ok: (s) => s.correcciones >= 1 },
  { id: "sobresaliente", icono: "⭐", nombre: "Sobresaliente", desc: "Un 9 o más en una corrección", ok: (s) => s.sobresalientes >= 1 },
  { id: "simulacro", icono: "⏱️", nombre: "Prueba de fuego", desc: "Terminar un simulacro de examen", ok: (s) => s.simulacros >= 1 },
  { id: "oral", icono: "🎙️", nombre: "Buena oradora", desc: "Explicar un tema en voz alta", ok: (s) => s.orales >= 1 },
  { id: "foco1", icono: "🎯", nombre: "Concentrada", desc: "Terminar un bloque de concentración", ok: (s) => s.concentracion >= 1 },
  { id: "foco20", icono: "🧘", nombre: "Mente de acero", desc: "20 bloques de concentración", ok: (s) => s.concentracion >= 20 },
  { id: "racha3", icono: "🔥", nombre: "3 días seguidos", desc: "Estudiar 3 días seguidos", ok: (s, r) => r >= 3 },
  { id: "racha7", icono: "🚀", nombre: "Una semana", desc: "Estudiar 7 días seguidos", ok: (s, r) => r >= 7 },
  { id: "racha30", icono: "👑", nombre: "Imparable", desc: "Estudiar 30 días seguidos", ok: (s, r) => r >= 30 },
];

let trabajando = null; // tema que la IA está preparando ahora
let borrador = null; // nuevo tema que se está montando
let temaVisible = null;
let urls = [];
const verFoto = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

function aviso(t) {
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = t;
  document.body.append(d);
  setTimeout(() => d.classList.add("fuera"), 2800);
  setTimeout(() => d.remove(), 3300);
}

const cabecera = (titulo, atras = "#/", extra = "") =>
  `<header class="cab">${atras === "atras" ? `<button class="atras" data-a="volver" aria-label="Volver">‹</button>` : atras ? `<a class="atras" href="${atras}" aria-label="Volver">‹</a>` : ""}<h1>${esc(titulo)}</h1>${extra}</header>`;
// Botón «?» que abre la guía en el apartado de esa pantalla
const ayudaBtn = (k) => `<a class="icono-btn ayuda-btn" href="#/ayuda/${k}" aria-label="Cómo funciona">?</a>`;

// ---------- Racha y logros ----------
const leerJSON = (k, defecto) => { try { return JSON.parse(ls.get(k)) ?? defecto; } catch { return defecto; } };
function racha() {
  const dias = new Set(leerJSON("repasa:dias", []));
  let d = dias.has(hoyISO()) ? hoyISO() : sumarDias(hoyISO(), -1), n = 0;
  while (dias.has(d)) (n++, (d = sumarDias(d, -1)));
  return n;
}
// Apunta un día estudiado y suma a los contadores; avisa de los logros nuevos
function actividad(contador, cuanto = 1) {
  const dias = leerJSON("repasa:dias", []);
  if (!dias.includes(hoyISO())) ls.set("repasa:dias", JSON.stringify([...dias, hoyISO()].slice(-400)));
  const s = leerJSON("repasa:stats", {});
  if (contador) s[contador] = (s[contador] || 0) + cuanto;
  ls.set("repasa:stats", JSON.stringify(s));
  const tengo = leerJSON("repasa:logros", []), r = racha();
  for (const l of LOGROS)
    if (!tengo.includes(l.id) && l.ok(s, r)) {
      tengo.push(l.id);
      setTimeout(() => aviso(`🏅 ¡Logro conseguido! ${l.icono} ${l.nombre}`), 600);
    }
  ls.set("repasa:logros", JSON.stringify(tengo));
}

// ---------- Secciones de cada tema (menú en 3 pasos) ----------
const SECCIONES = {
  traduccion: { icono: "🌍", nombre: "Traducción", desc: "El texto traducido y el vocabulario" },
  resumen: { icono: "📖", nombre: "Resumen", desc: "Todo el tema, explicado fácil" },
  esquema: { icono: "🗺️", nombre: "Esquema", desc: "El tema de un vistazo" },
  conceptos: { icono: "🔤", nombre: "Conceptos", desc: "Las definiciones que piden" },
  presentacion: { icono: "🎤", nombre: "Presentación", desc: "Tu guion y el modo ensayo" },
  dudas: { icono: "💬", nombre: "Dudas", desc: "Pregúntame lo que no entiendas" },
  tarjetas: { icono: "🃏", nombre: "Tarjetas", desc: "Memoriza sin que se te olvide" },
  test: { icono: "✅", nombre: "Test", desc: "Preguntas con 4 opciones" },
  oral: { icono: "🎙️", nombre: "Explícalo hablando", desc: "Habla y te digo qué tal" },
  examen: { icono: "✍️", nombre: "Preguntas de examen", desc: "Escribe y te pongo nota" },
  ejercicios: { icono: "✏️", nombre: "Ejercicios", desc: "Practica y corrige con fotos" },
  simulacro: { icono: "⏱️", nombre: "Simulacro", desc: "Un examen de verdad, con tiempo" },
  expres: { icono: "⚡", nombre: "Repaso exprés", desc: "Lo esencial y lo que aún fallas" },
  plan: { icono: "📅", nombre: "Mi plan", desc: "Qué hacer cada día" },
  paginas: { icono: "📄", nombre: "Mis páginas", desc: "Tus fotos" },
};
const PASOS_TEMA = [
  ["1 · Entiéndelo", ["traduccion", "resumen", "esquema", "conceptos", "presentacion", "dudas"]],
  ["2 · Apréndetelo", ["tarjetas", "test", "oral"]],
  ["3 · Ponte a prueba", ["examen", "ejercicios", "simulacro"]],
  ["Antes del examen", ["expres", "plan"]],
];

// ---------- Progreso ----------
const progresoVacio = () => ({ test: null, preguntas: {}, tarjetas: {}, plan: {}, simulacros: [] });
const esPendiente = (p) => !p || p.proxima <= hoyISO();
const tarjetasPendientes = (t) => (t.resumen ? t.resumen.tarjetas.map((c, i) => ({ t, i })).filter(({ i }) => esPendiente(t.progreso.tarjetas[i])) : []);
function dominio(t) {
  if (!t.resumen) return 0;
  const p = t.progreso, r = t.resumen, partes = [];
  if (p.test?.intentos) partes.push(p.test.mejor);
  const notas = Object.values(p.preguntas).map((x) => x.nota).filter((n) => n != null);
  if (notas.length && r.preguntas_examen.length) partes.push((notas.reduce((a, b) => a + b, 0) / r.preguntas_examen.length) * 10);
  if (r.tarjetas.length && Object.keys(p.tarjetas).length) partes.push((Object.values(p.tarjetas).filter((x) => x.caja >= 3).length / r.tarjetas.length) * 100);
  if (p.simulacros?.length) partes.push(p.simulacros.at(-1).nota * 10);
  return partes.length ? Math.round(partes.reduce((a, b) => a + b, 0) / partes.length) : 0;
}
const barra = (pct) => `<div class="barra"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;

// ---------- Navegación ----------
async function pintar() {
  window.speechSynthesis?.cancel();
  grabacion?.stop();
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const [ruta, a, b] = location.hash.replace(/^#\/?/, "").split("/");
  try {
    if (ruta === "nuevo") return pintarNuevo(a === "traducir", a === "examen" ? b : null);
    if (ruta === "libros") return await pintarLibros();
    if (ruta === "libro") return await pintarLibro(a);
    if (ruta === "concentrar") return pintarConcentrar();
    if (ruta === "tema") return await pintarTema(a, b);
    if (ruta === "repaso") return await pintarRepaso();
    if (ruta === "ajustes") return pintarAjustes();
    if (ruta === "corregir") return pintarCorregirSuelto();
    if (ruta === "combinar") return await pintarCombinar();
    if (ruta === "logros") return pintarLogros();
    if (ruta === "guia") return pintarGuia(+a || 0);
    if (ruta === "ayuda") return pintarAyuda(a);
    return await pintarInicio();
  } catch (e) {
    app.innerHTML = cabecera("Algo ha fallado") + `<div class="caja aviso">${esc(e.message || e)}</div><a class="btn" href="#/">Volver al inicio</a>`;
  }
}
const ir = (h) => (location.hash === h ? pintar() : (location.hash = h));
window.addEventListener("hashchange", () => { pintar(); window.scrollTo(0, 0); });

// ---------- Inicio ----------
const ASIGNATURAS = ["Matemáticas", "Lengua Castellana y Literatura", "Inglés", "Francés", "Geografía e Historia", "Biología y Geología", "Física y Química", "Tecnología y Digitalización", "Educación Física", "Música", "Educación Plástica, Visual y Audiovisual", "Religión", "Valores Cívicos y Éticos"];
const examenesApuntados = () => leerJSON("repasa:examenes", []).filter((e) => diasHasta(e.fecha) >= 0).sort((a, b) => a.fecha.localeCompare(b.fecha));

async function pintarInicio() {
  const temas = (await Almacen.todos()).sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0));
  const nombre = ls.get("repasa:nombre");
  const pendientes = temas.reduce((n, t) => n + tarjetasPendientes(t).length, 0);
  const instalada = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  const grupos = {};
  for (const t of temas) (grupos[t.resumen?.asignatura || (trabajando?.id === t.id ? "Preparándose…" : "Sin terminar")] ||= []).push(t);
  // Exámenes: los de los temas y los apuntados que aún no tienen tema
  const proximos = [
    ...temas.filter((t) => t.fechaExamen && diasHasta(t.fechaExamen) >= 0).map((t) => ({ fecha: t.fechaExamen, t })),
    ...examenesApuntados().map((e) => ({ fecha: e.fecha, e })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const r = racha(), conTema = temas.filter((t) => t.resumen);
  const mensaje = (ls.get("repasa:mensaje") || "").trim();
  const saldo = IA.saldoRestante();
  const inminente = proximos.find((x) => x.t?.resumen && diasHasta(x.fecha) <= 1);
  const sinPreparar = proximos.find((x) => x.e && diasHasta(x.fecha) <= 7);
  const ultimaCopia = ls.get("repasa:ultimaCopia");
  const pedirCopia = conTema.length >= 3 && (!ultimaCopia || diasEntre(ultimaCopia, hoyISO()) > 14);
  const asignaturas = [...new Set([...conTema.map((t) => t.resumen.asignatura), ...ASIGNATURAS])];
  app.innerHTML = `
    <header class="cab inicio"><div><div class="hola">${nombre ? `Hola, ${esc(nombre)} ${esc(ls.get("repasa:emoji") || "👋")}` : "Hola 👋"}</div><h1>Repasa</h1></div>
      <div class="cab-der"><a class="racha ${r ? "" : "apagada"}" href="#/logros" aria-label="Racha y logros">🔥 ${r}</a><a class="icono-btn ayuda-btn" href="#/ayuda" aria-label="Cómo funciona">?</a><a class="icono-btn" href="#/ajustes" aria-label="Ajustes">⚙️</a></div></header>
    ${!IA.tieneClave() ? `<a class="caja aviso enlace" href="#/ajustes"><b>Falta un paso:</b> poner la clave de la IA en Ajustes (lo hace Eduardo una vez).</a>` : ""}
    ${!nombre ? `<form class="caja" data-f="nombre"><label class="etq" for="nom">¿Cómo te llamas?</label><div class="fila"><input id="nom" autocomplete="given-name" placeholder="Tu nombre"><button class="btn" type="submit">Guardar</button></div></form>` : ""}
    ${!instalada && !ls.get("repasa:sinInstalar") ? `<div class="caja suave"><b>Ponla como una app:</b> en Safari toca <b>Compartir</b> (el cuadrado con la flecha) → <b>Añadir a pantalla de inicio</b>. Así tus temas quedan guardados para siempre. <button class="enlace-btn" data-a="cerrar-instalar">Vale</button></div>` : ""}
    ${IA.sinSaldoAhora() ? `<div class="caja aviso-saldo"><b>⚠️ Se ha acabado el saldo de la IA</b><p class="peq">Puedes seguir repasando lo que ya tienes (tarjetas, test, resumen…), pero no crear temas ni corregir hasta que Eduardo lo recargue.</p><button class="btn ancho" data-a="avisar-saldo" data-que="acabado">📲 Avisar a Eduardo</button></div>`
      : saldo != null && saldo < 2 ? `<div class="caja aviso-saldo poco"><b>Queda poco saldo de la IA</b><p class="peq">Quedan unos ${Math.max(0, saldo).toFixed(2).replace(".", ",")} $. Avisa a Eduardo para que lo recargue antes de que se acabe.</p><button class="btn sec ancho" data-a="avisar-saldo" data-que="poco">📲 Avisar a Eduardo</button></div>` : ""}
    ${mensaje ? `<div class="caja mensaje"><div class="etq">💌 Mensaje de Eduardo</div><p>${md(mensaje)}</p></div>` : ""}
    ${inminente ? `<a class="caja enlace examen-ya" href="#/tema/${inminente.t.id}/expres"><span class="emoji">⚡</span><span><b>Examen ${cuandoEs(inminente.fecha)}</b><small>${esc(inminente.t.resumen.titulo)} · haz el Repaso exprés</small></span><span class="flecha">›</span></a>` : ""}
    ${sinPreparar && !inminente ? `<a class="caja enlace examen-ya" href="#/nuevo/examen/${sinPreparar.e.id}"><span class="emoji">⏰</span><span><b>${esc(sinPreparar.e.asignatura)}: examen ${cuandoEs(sinPreparar.fecha)}</b><small>Aún no has creado el tema. Hazlo ya y te organizo los días.</small></span><span class="flecha">›</span></a>` : ""}
    <div class="acciones">
      <a class="grande-btn principal" href="#/nuevo"><span class="emoji">📸</span><span><b>Nuevo tema</b><small>Fotos de tu libro o apuntes → todo listo para estudiar</small></span></a>
      <div class="dos">
        <a class="grande-btn mini" href="#/libros"><span class="emoji">📚</span><span><b>Mis libros</b><small>Guarda tus libros y elige páginas</small></span></a>
        <a class="grande-btn mini" href="#/nuevo/traducir"><span class="emoji">🌍</span><span><b>Traducir</b><small>Inglés, francés… con fotos</small></span></a>
        <a class="grande-btn mini" href="#/corregir"><span class="emoji">✏️</span><span><b>Corregir</b><small>Foto de tus deberes → nota</small></span></a>
        <a class="grande-btn mini" href="#/concentrar"><span class="emoji">🎯</span><span><b>Concentrarme</b><small>Estudiar sin distracciones</small></span></a>
      </div>
    </div>
    ${pendientes ? `<a class="caja repaso enlace" href="#/repaso"><span class="emoji">🧠</span><span><b>Repaso de hoy</b><small>${pendientes} tarjeta${pendientes === 1 ? "" : "s"} · unos ${Math.max(2, Math.round(pendientes / 4))} minutos</small></span><span class="flecha">›</span></a>` : ""}
    <h2 class="titulo-sec">Próximos exámenes</h2>
    ${proximos.map((x) => x.t
      ? `<a class="caja fila-tema enlace" href="#/tema/${x.t.id}/plan"><span class="cuando ${diasHasta(x.fecha) <= 2 ? "urgente" : ""}">${cuandoEs(x.fecha)}</span><span class="nombre-tema">${esc(x.t.resumen?.titulo || "Tema")}<small>${esc(x.t.resumen?.asignatura || "")}</small></span><span class="flecha">›</span></a>`
      : `<div class="caja fila-tema"><span class="cuando ${diasHasta(x.fecha) <= 7 ? "urgente" : ""}">${cuandoEs(x.fecha)}</span><span class="nombre-tema">${esc(x.e.asignatura)}<small>${x.e.que ? esc(x.e.que) + " · " : ""}<a href="#/nuevo/examen/${x.e.id}">Prepararlo →</a></small></span><button class="quitar-ex" data-a="borrar-examen" data-id="${x.e.id}" aria-label="Quitar examen">✕</button></div>`).join("")}
    <details class="caja apuntar" ${proximos.length ? "" : "open"}><summary>➕ Apuntar un examen</summary>
      <form data-f="examen">
        <label class="etq" for="ex-asig">Asignatura</label>
        <input id="ex-asig" list="lista-asig" required placeholder="Ej.: Geografía e Historia"><datalist id="lista-asig">${asignaturas.map((a) => `<option value="${esc(a)}">`).join("")}</datalist>
        <label class="etq" for="ex-fecha">Fecha</label>
        <input id="ex-fecha" type="date" required min="${hoyISO()}">
        <label class="etq" for="ex-que">¿Qué entra? <span class="opc">(opcional)</span></label>
        <input id="ex-que" placeholder="Ej.: temas 3 y 4">
        <button class="btn ancho" type="submit">Apuntar</button>
      </form>
      <p class="peq">Apúntalo en cuanto te lo digan: te aviso para que empieces con tiempo.</p>
    </details>
    ${pedirCopia ? `<a class="caja suave enlace" href="#/ajustes"><span class="emoji">💾</span><span><b>Haz una copia de seguridad</b><small>Tarda 10 segundos y no perderás tus temas si cambias de móvil</small></span><span class="flecha">›</span></a>` : ""}
    ${Object.entries(grupos).map(([asig, ts]) => `<h2 class="titulo-sec">${esc(asig)}</h2>${ts.map((t) => `
      <a class="caja fila-tema enlace" href="#/tema/${t.id}">
        <span class="nombre-tema">${t.objetivo === "traducir" ? "🌍 " : ""}${esc(t.resumen?.titulo || `${t.fotos.length} foto${t.fotos.length === 1 ? "" : "s"}`)}<small>${t.resumen ? `Lo dominas al ${dominio(t)}%` : trabajando?.id === t.id ? "La IA está con ello…" : "No se terminó: toca para reintentar"}</small>${t.resumen ? barra(dominio(t)) : ""}</span><span class="flecha">›</span>
      </a>`).join("")}`).join("")}
    ${conTema.length >= 2 ? `<a class="enlace-pie" href="#/combinar">🧩 ¿Un examen con varios temas? Júntalos en uno</a>` : ""}
    ${!temas.length ? `<div class="vacio"><p>Aún no tienes temas.</p><p>Haz fotos a las páginas que entran y te preparo el resumen, el esquema, un test, tarjetas para memorizar y las preguntas que pueden caer, con corrección.</p></div>` : ""}`;
}

// ---------- Nuevo tema ----------
function selectorIdioma(id, valor, texto) {
  const otro = valor && !IDIOMAS.includes(valor);
  return `<label class="etq" for="${id}">${texto}</label>
    <select id="${id}" data-idioma>${IDIOMAS.map((l) => `<option ${l === valor ? "selected" : ""}>${l}</option>`).join("")}<option value="__otro" ${otro ? "selected" : ""}>Otro…</option></select>
    <input id="${id}-otro" class="${otro ? "" : "oculto"}" placeholder="Escribe el idioma" value="${otro ? esc(valor) : ""}">`;
}

function pintarNuevo(traducir, examenId) {
  const e = examenId && leerJSON("repasa:examenes", []).find((x) => x.id === examenId);
  if (e && borrador?.examenId !== e.id) borrador = { traducir: false, fotos: borrador?.traducir === false && !borrador.examenId ? borrador.fotos : [], objetivo: "examen", idioma: "Español", fecha: e.fecha, notas: e.que ? `Entra: ${e.que}` : "", examenId: e.id, para: `${e.asignatura} · ${cuandoEs(e.fecha)}` };
  if (!borrador || borrador.traducir !== traducir) borrador = { traducir, fotos: [], objetivo: traducir ? "traducir" : "examen", idioma: "Español", fecha: "", notas: "" };
  const b = borrador;
  app.innerHTML = `
    ${cabecera(traducir ? "Traducir con fotos" : "Nuevo tema", "#/", ayudaBtn(traducir ? "traducir" : "nuevo"))}
    ${b.para ? `<div class="caja suave fila-para"><span>📅 Para el examen de <b>${esc(b.para)}</b></span><button class="enlace-btn" data-a="soltar-examen">Quitar</button></div>` : ""}
    ${b.deLibro ? `<div class="caja suave fila-para"><span>📚 ${esc(b.deLibro)}</span></div>` : ""}
    <div class="caja">
      <div class="etq">1. ${traducir ? "Haz foto al texto" : "Haz fotos a las páginas"}</div>
      <p class="peq">Una foto por página, recta, con luz y la página entera. Por orden. Hasta ${MAX_FOTOS}.</p>
      ${b.fotos.length ? `<div class="fotos">${b.fotos.map((f, i) => `<div class="foto"><img src="${verFoto(f)}" alt="Página ${i + 1}"><span class="num">${i + 1}</span><button class="quitar" data-a="quitar-foto" data-i="${i}" aria-label="Quitar">✕</button>${i ? `<button class="mover" data-a="mover-foto" data-i="${i}" aria-label="Mover antes">◀</button>` : ""}</div>`).join("")}</div>` : ""}
      <div class="fila">
        <label class="btn" for="cam">📷 Hacer foto</label>
        <label class="btn sec" for="gal">🖼️ De la galería</label>
      </div>
      <input type="file" id="cam" accept="image/*" capture="environment" data-fotos="borrador" hidden>
      <input type="file" id="gal" accept="image/*" multiple data-fotos="borrador" hidden>
      <div id="cargando-fotos"></div>
    </div>
    ${traducir ? `<div class="caja">${selectorIdioma("idioma", b.idioma, "2. ¿A qué idioma lo traduzco?")}<p class="peq">Te hago la traducción completa, el vocabulario importante y el resumen con test y tarjetas, todo en ese idioma.</p></div>` : `
    <div class="caja">
      <div class="etq">2. ¿Para qué lo necesitas?</div>
      <div class="opciones">${Object.entries(OBJETIVOS).map(([k, o]) => `<button class="opcion ${b.objetivo === k ? "activa" : ""}" data-a="objetivo" data-k="${k}"><span>${o.icono}</span>${o.nombre}</button>`).join("")}</div>
      ${selectorIdioma("idioma", b.idioma, "Idioma del resumen")}
    </div>`}
    <div class="caja">
      <label class="etq" for="fecha">3. ¿Cuándo es el examen o la entrega? <span class="opc">(opcional)</span></label>
      <input type="date" id="fecha" min="${hoyISO()}" value="${esc(b.fecha)}">
      <label class="etq" for="notas">¿Algo que haya dicho el profe? <span class="opc">(opcional)</span></label>
      <textarea id="notas" rows="3" placeholder="${traducir ? "Ej.: es para el examen de inglés, céntrate en los verbos…" : "Ej.: entra hasta la página 54, pregunta mucho las fechas, la presentación dura 5 minutos…"}">${esc(b.notas)}</textarea>
    </div>
    <button class="btn enorme" data-a="crear" ${b.fotos.length ? "" : "disabled"}>✨ ${traducir ? "Traducir y resumir" : "Crear mi material de estudio"}</button>
    ${!IA.tieneClave() ? `<p class="peq centro">Antes hay que poner la clave de la IA en <a href="#/ajustes">Ajustes</a>.</p>` : ""}`;
}

function leerIdioma() {
  const s = $("#idioma");
  if (!s) return borrador?.idioma || "Español";
  return s.value === "__otro" ? $("#idioma-otro").value.trim() || "Español" : s.value;
}

// Reduce la foto (lado largo 2000 px, JPEG) para que pese poco pero se lea perfecto
async function comprimir(file, max = 2000) {
  let img = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!img)
    img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se ha podido abrir una de las fotos"));
      i.src = URL.createObjectURL(file);
    });
  const f = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * f);
  c.height = Math.round(img.height * f);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
}
const aBase64 = (blob) =>
  new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = () => mal(r.error);
    r.readAsDataURL(blob);
  });

async function añadirFotos(input) {
  const archivos = [...input.files];
  input.value = "";
  if (!archivos.length) return;
  if (input.dataset.fotos === "portada") return nuevoLibro(await comprimir(archivos[0], 1600));
  if (input.dataset.fotos === "libro") return guardarPaginasLibro(archivos);
  const destino = input.dataset.fotos === "tema" ? temaVisible.fotos : input.dataset.fotos === "corregir" ? fotosCorregir : borrador.fotos;
  const sitio = (input.dataset.fotos === "corregir" ? 5 : MAX_FOTOS) - destino.length;
  if (sitio <= 0) return aviso(input.dataset.fotos === "corregir" ? "Como mucho 5 fotos por corrección" : `Como mucho ${MAX_FOTOS} fotos por tema`);
  if (archivos.length > sitio) aviso(`Solo caben ${sitio} fotos más`);
  const z = $("#cargando-fotos");
  if (z) z.innerHTML = `<p class="peq">Preparando fotos…</p>`;
  const nuevas = [];
  for (const f of archivos.slice(0, sitio)) {
    try { nuevas.push(await comprimir(f)); } catch (e) { aviso(e.message); }
  }
  if (input.dataset.fotos === "corregir") {
    enunciadoCorregir = $("#cor-enunciado")?.value || enunciadoCorregir;
    fotosCorregir.push(...nuevas);
    $("#corrector").innerHTML = htmlCorrector();
  } else if (input.dataset.fotos === "tema") {
    if (!nuevas.length) return;
    if (trabajando) return aviso("Espera a que termine el tema que se está preparando");
    if (!confirm(`¿Añado ${nuevas.length} página${nuevas.length === 1 ? "" : "s"} y rehago el material con todas? Se reinicia tu progreso de este tema.`)) return;
    temaVisible.fotos.push(...nuevas);
    generar(temaVisible);
  } else {
    borrador.fotos.push(...nuevas);
    pintarNuevo(borrador.traducir);
  }
}

// Límite de temas nuevos al día que pone Eduardo (0 = sin límite)
async function puedoCrearTema() {
  if (!IA.tieneClave()) return aviso("Primero hay que poner la clave en Ajustes"), false;
  if (trabajando) return aviso("Espera a que termine el tema que se está preparando"), false;
  const limite = Number(ls.get("repasa:limiteDia") ?? 0);
  const hoy = (await Almacen.todos()).filter((t) => iso(new Date(t.creado)) === hoyISO()).length;
  if (limite > 0 && hoy >= limite) return aviso(`Hoy ya has creado ${hoy} temas, que es el máximo. ¡Mañana más!`), false;
  return true;
}

async function crear() {
  if (!(await puedoCrearTema())) return;
  const b = borrador;
  if (b.examenId) ls.set("repasa:examenes", JSON.stringify(leerJSON("repasa:examenes", []).filter((x) => x.id !== b.examenId)));
  b.idioma = leerIdioma();
  b.fecha = $("#fecha").value;
  b.notas = $("#notas").value.trim();
  const t = {
    id: nuevoId(), creado: Date.now(), fotos: b.fotos, objetivo: b.objetivo, idioma: b.idioma, fechaExamen: b.fecha, planInicio: hoyISO(),
    notas: [b.contextoLibro, b.notas].filter(Boolean).join("\n"), resumen: null, progreso: progresoVacio(), chat: [], coste: 0,
  };
  await Almacen.guardar(t);
  borrador = null;
  generar(t);
}

// La IA prepara el tema (tarda 1-3 minutos)
async function generar(t) {
  trabajando = { id: t.id, letras: 0, inicio: Date.now(), fotos: t.fotos.length };
  let bloqueo = null;
  try { bloqueo = await navigator.wakeLock?.request("screen"); } catch {}
  ir(`#/tema/${t.id}`);
  try {
    const dias = t.fechaExamen ? Math.max(0, diasHasta(t.fechaExamen)) : null;
    const op = { objetivo: t.objetivo, idioma: t.idioma, notas: t.notas, dias };
    const alTexto = (d) => (trabajando.letras += d.length);
    let res;
    if (t.origen?.length) {
      const fuentes = (await Promise.all(t.origen.map((id) => Almacen.leer(id)))).filter((x) => x?.resumen);
      if (!fuentes.length) throw new Error("Los temas que se juntaban ya no existen.");
      res = await IA.combinar(fuentes, op, alTexto);
    } else res = await IA.hacerTema(await Promise.all(t.fotos.map(aBase64)), op, alTexto);
    const { datos, coste } = res;
    const primeraVez = !t.resumen;
    Object.assign(t, { resumen: datos, error: "", progreso: progresoVacio(), chat: [], facil: {}, practica: [], correcciones: [], coste: (t.coste || 0) + coste });
    await Almacen.guardar(t);
    if (primeraVez && datos.lectura.ok) actividad(t.objetivo === "traducir" ? "traducciones" : "temas");
    if (primeraVez && datos.lectura.ok && t.objetivo === "traducir") actividad("temas");
    aviso(datos.lectura.ok ? "¡Listo! Ya puedes estudiar ✨" : "Revisa los avisos sobre tus fotos");
  } catch (e) {
    t.error = IA.traducirError(e);
    await Almacen.guardar(t);
    if (t.resumen) aviso(t.error);
  }
  trabajando = null;
  bloqueo?.release?.().catch(() => {});
  if (location.hash.startsWith(`#/tema/${t.id}`)) pintar();
}

function pintarTrabajando(t) {
  app.innerHTML = `${cabecera("Preparando tu material", "#/")}
    <div class="trabajando">
      <div class="orbe">✨</div>
      <h2 id="fase">Leyendo tus páginas…</h2>
      ${barra(0)}
      <ul class="fases" id="fases"></ul>
      <p class="peq centro">Tarda entre 1 y 3 minutos. <b>No cierres la app ni bloquees el móvil</b> hasta que termine.</p>
    </div>`;
  const FASES = t.objetivo === "traducir"
    ? ["Leyendo el texto", "Traduciendo", "Sacando el vocabulario", "Haciendo el resumen", "Preparando test y tarjetas"]
    : ["Leyendo tus páginas", "Entendiendo el tema", "Organizando el resumen y el esquema", "Pensando las preguntas de examen", "Preparando test y tarjetas"];
  const esperado = (t.objetivo === "traducir" ? 16000 : 9000) + 3000 * (t.fotos.length || 3 * (t.origen?.length || 1));
  const reloj = setInterval(() => {
    if (!trabajando || trabajando.id !== t.id || !$("#fases")) return clearInterval(reloj);
    const seg = (Date.now() - trabajando.inicio) / 1000;
    // Mientras piensa no llega texto: la barra avanza con el tiempo hasta el 30 % y luego según lo escrito
    const pct = trabajando.letras ? 30 + 68 * Math.min(1, trabajando.letras / esperado) : 30 * (1 - Math.exp(-seg / 40));
    const fase = Math.min(FASES.length - 1, trabajando.letras ? 2 + Math.floor((trabajando.letras / esperado) * (FASES.length - 2)) : seg > 25 ? 1 : 0);
    $(".trabajando .barra span").style.width = pct + "%";
    $("#fase").textContent = FASES[fase] + "…";
    $("#fases").innerHTML = FASES.map((f, i) => `<li class="${i < fase ? "hecha" : i === fase ? "ahora" : ""}">${i < fase ? "✓" : i === fase ? "•" : "○"} ${f}</li>`).join("");
  }, 400);
}

function pintarSinTerminar(t) {
  app.innerHTML = `${cabecera("Tema sin terminar")}
    <div class="caja aviso"><b>No se pudo terminar.</b><p>${esc(t.error || "Se cortó antes de acabar (quizá se cerró la app).")}</p><p class="peq">Tus fotos están guardadas: no hace falta repetirlas.</p></div>
    <div class="fotos">${t.fotos.map((f, i) => `<div class="foto"><img src="${verFoto(f)}" alt="Página ${i + 1}"><span class="num">${i + 1}</span></div>`).join("")}</div>
    <button class="btn enorme" data-a="reintentar">🔁 Volver a intentarlo</button>
    <button class="btn peligro" data-a="borrar-tema">Borrar este tema</button>`;
}

// ---------- Tema ----------
async function pintarTema(id, pest) {
  const t = await Almacen.leer(id);
  if (!t) return ir("#/");
  temaVisible = t;
  if (trabajando?.id === id) return pintarTrabajando(t);
  if (!t.resumen) return pintarSinTerminar(t);
  const r = t.resumen;
  if (!r.lectura.ok && !r.apartados.length) {
    app.innerHTML = `${cabecera("No he podido leerlo")}<div class="caja aviso"><ul>${r.lectura.avisos.map((a) => `<li>${md(a)}</li>`).join("")}</ul></div><button class="btn peligro" data-a="borrar-tema">Borrar y probar con otras fotos</button>`;
    return;
  }
  t.progreso.simulacros ||= [];
  t.practica ||= [];
  t.correcciones ||= [];
  const hay = (k) => (k === "traduccion" ? r.traduccion.length : k === "presentacion" ? r.presentacion.guion.length : true);
  if (!pest || !SECCIONES[pest] || !hay(pest)) return pintarMenuTema(t, hay);
  // Apunta lo que ya ha abierto (para el «Te toca ahora»)
  if (!t.vistos?.[pest]) (t.vistos ||= {})[pest] = true, Almacen.guardar(t);
  const sec = SECCIONES[pest];
  app.innerHTML = `${cabecera(`${sec.icono} ${sec.nombre}`, `#/tema/${t.id}`, ayudaBtn(pest))}
    <div class="sub-cab">${esc(r.titulo)}</div>
    <section id="zona"></section>`;
  PANELES[pest]($("#zona"), t);
}

// Lo que más le conviene hacer ahora con este tema
function siguientePaso(t) {
  const r = t.resumen, p = t.progreso, v = t.vistos || {};
  const hechas = Object.values(p.preguntas).filter((x) => x.nota != null).length;
  if (r.traduccion.length && !v.traduccion) return ["traduccion", "Lee la traducción"];
  if (!v.resumen) return ["resumen", "Empieza leyendo el resumen"];
  if (!v.esquema) return ["esquema", "Mira el esquema para verlo todo junto"];
  if (tarjetasPendientes(t).length) return ["tarjetas", `Repasa tus ${tarjetasPendientes(t).length} tarjetas de hoy`];
  if (!p.test) return ["test", "Haz el test"];
  if (r.presentacion.guion.length && !v.presentacion) return ["presentacion", "Prepara tu presentación"];
  if (hechas < Math.min(3, r.preguntas_examen.length)) return ["examen", "Contesta preguntas de examen y te pongo nota"];
  if (!p.simulacros.length) return ["simulacro", "Haz un simulacro de examen"];
  if (t.fechaExamen && diasHasta(t.fechaExamen) <= 1 && diasHasta(t.fechaExamen) >= 0) return ["expres", "Repaso exprés antes del examen"];
  return ["expres", "Repasa lo que aún fallas"];
}

function pintarMenuTema(t, hay) {
  const r = t.resumen, p = t.progreso;
  const [sig, texto] = siguientePaso(t);
  const pendientes = tarjetasPendientes(t).length;
  const hechas = Object.values(p.preguntas).filter((x) => x.nota != null).length;
  const estado = {
    tarjetas: pendientes ? `${pendientes} para hoy` : "Al día ✓",
    test: p.test ? `Tu mejor nota: ${notaTexto(p.test.mejor / 10)}` : "",
    examen: hechas ? `${hechas} de ${r.preguntas_examen.length} contestadas` : "",
    simulacro: p.simulacros.length ? `Último: ${notaTexto(p.simulacros.at(-1).nota)}` : "",
    plan: t.fechaExamen ? `Examen ${cuandoEs(t.fechaExamen)}` : "Pon la fecha del examen",
  };
  const boton = (k) => {
    const s = SECCIONES[k];
    return `<a class="seccion ${k === sig ? "sugerida" : ""}" href="#/tema/${t.id}/${k}"><span class="emoji">${s.icono}</span><span><b>${s.nombre}</b><small>${estado[k] || s.desc}</small></span></a>`;
  };
  app.innerHTML = `${cabecera(r.titulo, "#/", ayudaBtn("menu"))}
    <div class="sub-cab">${esc(r.asignatura)}${t.fechaExamen ? ` · examen ${cuandoEs(t.fechaExamen)}` : ""}${r.idioma_original && r.traduccion.length ? ` · de ${esc(r.idioma_original)} a ${esc(t.idioma)}` : ""}</div>
    <div class="caja dominio"><div class="fila-dominio"><b>Lo dominas al ${dominio(t)}%</b></div>${barra(dominio(t))}</div>
    <a class="caja enlace toca" href="#/tema/${t.id}/${sig}"><span class="emoji">👉</span><span><small>Te toca ahora</small><b>${esc(texto)}</b></span><span class="flecha">›</span></a>
    ${PASOS_TEMA.map(([titulo, ks]) => { const vis = ks.filter(hay); return vis.length ? `<h2 class="titulo-sec">${titulo}</h2><div class="secciones">${vis.map(boton).join("")}</div>` : ""; }).join("")}
    <a class="enlace-pie" href="#/tema/${t.id}/paginas">📄 ${t.origen?.length ? "Temas que se juntaron" : "Mis páginas"} · borrar o rehacer</a>`;
}

const lista = (xs) => `<ul>${xs.map((x) => `<li>${md(x)}</li>`).join("")}</ul>`;

const PANELES = {
  traduccion(z, t) {
    const r = t.resumen;
    z.innerHTML = `
      ${r.lectura.avisos.length ? `<div class="caja aviso"><b>Ojo con tus fotos</b>${lista(r.lectura.avisos)}</div>` : ""}
      ${r.traduccion.map((p) => `<article class="caja traduccion"><div class="etq">${esc(p.pagina)}</div>${mdBloque(p.texto)}</article>`).join("")}
      <div class="fila"><button class="btn sec" data-a="copiar-traduccion">📋 Copiar</button><button class="btn sec" data-a="escuchar" data-que="traduccion">🔊 Escuchar</button></div>
      ${r.vocabulario.length ? `<h2 class="titulo-sec">Vocabulario importante</h2><div class="caja"><dl class="vocab">${r.vocabulario.map((v) => `<dt>${esc(v.original)}</dt><dd><b>${esc(v.traduccion)}</b>${v.ejemplo ? `<small>${esc(v.ejemplo)}</small>` : ""}</dd>`).join("")}</dl></div>` : ""}`;
  },

  resumen(z, t) {
    const r = t.resumen;
    const grupos = {};
    for (const d of r.datos_clave) (grupos[d.tipo] ||= []).push(d);
    z.innerHTML = `
      ${r.lectura.avisos.length && !r.traduccion.length ? `<div class="caja aviso"><b>Ojo con tus fotos</b>${lista(r.lectura.avisos)}</div>` : ""}
      <div class="caja destacada"><div class="etq">En 30 segundos</div><p class="grande">${md(r.en_30_segundos)}</p>
        <button class="btn sec peq no-imprimir" data-a="escuchar" data-que="resumen">🔊 Escuchar el resumen</button></div>
      ${r.por_que_importa ? `<div class="caja"><div class="etq">¿Para qué sirve esto?</div><p>${md(r.por_que_importa)}</p></div>` : ""}
      ${r.apartados.map((a, i) => `
        <article class="caja apartado">
          <div class="ap-cab"><h2>${i + 1}. ${md(a.titulo)}</h2>${a.paginas ? `<span class="pag">${esc(a.paginas)}</span>` : ""}</div>
          <ul class="ideas">${a.ideas.map((x) => `<li>${md(x)}</li>`).join("")}</ul>
          ${a.ejemplo ? `<div class="ejemplo"><div class="etq">Ejemplo</div>${mdBloque(a.ejemplo)}</div>` : ""}
          <div class="facil" id="facil-${i}">${t.facil?.[i] ? `<div class="etq">Más fácil</div>${mdBloque(t.facil[i])}` : ""}</div>
          ${t.facil?.[i] ? "" : `<button class="btn sec peq no-imprimir" data-a="facil" data-i="${i}">💡 Explícamelo más fácil</button>`}
        </article>`).join("")}
      ${r.datos_clave.length ? `<h2 class="titulo-sec">Datos que hay que saberse</h2><div class="caja">${Object.entries(grupos).map(([tipo, ds]) => ds.map((d) => `<div class="dato"><span class="icono">${ICONO_DATO[tipo] || "📌"}</span><div><b>${md(d.dato)}</b>${d.explicacion ? `<small>${md(d.explicacion)}</small>` : ""}</div></div>`).join("")).join("")}</div>` : ""}
      ${r.trucos_memoria.length ? `<h2 class="titulo-sec">Trucos para memorizar</h2>${r.trucos_memoria.map((x) => `<div class="caja truco"><div class="etq">${md(x.para)}</div><p>${md(x.truco)}</p></div>`).join("")}` : ""}
      ${r.errores_tipicos.length ? `<h2 class="titulo-sec">Cuidado con esto</h2><div class="caja cuidado">${lista(r.errores_tipicos)}</div>` : ""}
      ${r.fuera_del_libro.length ? `<div class="caja suave"><div class="etq">Esto lo añado yo (no está en tus páginas)</div>${lista(r.fuera_del_libro)}<p class="peq">Úsalo para entender, pero comprueba con tu profe si entra.</p></div>` : ""}
      <button class="btn sec no-imprimir" data-a="imprimir">🖨️ Guardar en PDF o imprimir</button>`;
  },

  esquema(z, t) {
    const e = t.resumen.esquema;
    z.innerHTML = `<div class="esquema">
      <div class="nodo centro">${md(e.centro)}</div>
      ${e.ramas.map((rama) => `<div class="rama"><div class="nodo n1">${md(rama.nombre)}</div>
        ${rama.subramas.map((s) => `<div class="subrama"><div class="nodo n2">${md(s.nombre)}</div>${s.detalles.length ? lista(s.detalles) : ""}</div>`).join("")}
      </div>`).join("")}
    </div>
    <p class="peq centro">Truco: tápalo e intenta dibujarlo de memoria en un papel.</p>`;
  },

  conceptos(z, t) {
    const ocultar = ls.get("repasa:ocultarConceptos") === "1";
    z.innerHTML = `
      <label class="interruptor caja"><input type="checkbox" data-a="ocultar-conceptos" ${ocultar ? "checked" : ""}><span>Ponerme a prueba (ocultar las definiciones)</span></label>
      ${t.resumen.conceptos.map((c) => `<details class="caja concepto" ${ocultar ? "" : "open"}><summary>${md(c.termino)}</summary><p>${md(c.definicion)}</p>${c.con_tus_palabras ? `<p class="palabras"><span class="etq">Dicho fácil</span> ${md(c.con_tus_palabras)}</p>` : ""}</details>`).join("")}`;
  },

  tarjetas(z, t) {
    const r = t.resumen, hoy = tarjetasPendientes(t);
    const dominadas = Object.values(t.progreso.tarjetas).filter((x) => x.caja >= 3).length;
    z.innerHTML = `<div class="caja centro">
      <div class="emoji">🃏</div>
      <h2>${hoy.length ? `${hoy.length} tarjeta${hoy.length === 1 ? "" : "s"} para hoy` : "Por hoy, todo repasado"}</h2>
      <p class="peq">Dominas ${dominadas} de ${r.tarjetas.length}. Las que te sabes vuelven a salir más tarde; las que no, enseguida.</p>
      ${barra((dominadas / Math.max(1, r.tarjetas.length)) * 100)}
      <div class="fila centrada">${hoy.length ? `<button class="btn" data-a="empezar-tarjetas" data-todas="0">Empezar</button>` : ""}<button class="btn sec" data-a="empezar-tarjetas" data-todas="1">Repasar todas</button></div>
    </div>`;
  },

  test(z, t) {
    const p = t.progreso.test, n = t.resumen.test.length;
    z.innerHTML = `<div class="caja centro">
      <div class="emoji">✅</div>
      <h2>Test de ${n} preguntas</h2>
      ${p ? `<p>Tu mejor nota: <b>${(p.mejor / 10).toFixed(1).replace(".", ",")}</b> · la última: ${(p.ultima / 10).toFixed(1).replace(".", ",")}</p>` : `<p class="peq">Contesta y te explico cada respuesta al momento.</p>`}
      <div class="fila centrada"><button class="btn" data-a="empezar-test">${p ? "Hacerlo otra vez" : "Empezar"}</button>${p?.falladas?.length ? `<button class="btn sec" data-a="empezar-test" data-falladas="1">Solo las ${p.falladas.length} que fallé</button>` : ""}</div>
    </div>`;
  },

  examen(z, t) {
    const p = t.progreso.preguntas;
    z.innerHTML = `<p class="intro">Escribe tu respuesta como en el examen y te la corrijo con nota. Las <span class="badge alta">Muy probable</span> son las que más pueden caer.</p>
      ${t.resumen.preguntas_examen.map((q, i) => {
        const h = p[i] || {};
        return `<article class="caja pregunta">
          <div class="badges">${q.probabilidad === "muy_probable" ? `<span class="badge alta">Muy probable</span>` : ""}<span class="badge">${TIPO_PREGUNTA[q.tipo] || ""}</span>${h.nota != null ? `<span class="badge nota ${claseNota(h.nota)}">${h.nota}/10</span>` : ""}</div>
          <h3>${md(q.pregunta)}</h3>
          <textarea id="resp-${i}" data-resp="${i}" rows="4" placeholder="Tu respuesta…">${esc(h.respuesta || "")}</textarea>
          <div class="fila"><button class="btn" data-a="corregir" data-i="${i}">✨ Corregir</button><button class="btn sec" data-a="ver-modelo" data-i="${i}">Ver la respuesta de 10</button></div>
          <div id="corr-${i}">${h.correccion ? htmlCorreccion(h.correccion) : ""}</div>
          <div class="modelo oculto" id="mod-${i}"><div class="etq">Respuesta de 10</div>${mdBloque(q.respuesta_modelo)}${q.claves.length ? `<div class="etq">Lo que busca el profe</div>${lista(q.claves)}` : ""}</div>
        </article>`;
      }).join("")}`;
  },

  // Lo imprescindible para los últimos minutos y lo que aún falla según su progreso
  expres(z, t) {
    const r = t.resumen, p = t.progreso;
    const fTest = [...new Set(p.test?.falladas || [])].map((i) => r.test[i]).filter(Boolean);
    const fTarjetas = r.tarjetas.filter((_, i) => p.tarjetas[i] && p.tarjetas[i].caja <= 1);
    const fPreguntas = r.preguntas_examen.map((q, i) => ({ q, h: p.preguntas[i] })).filter((x) => x.h?.nota != null && x.h.nota < 7);
    const fallos = fTest.length + fTarjetas.length + fPreguntas.length;
    const probadas = p.test || Object.keys(p.tarjetas).length || Object.keys(p.preguntas).length;
    z.innerHTML = `
      <div class="caja destacada"><div class="etq">⚡ Repaso exprés</div><p>Lo imprescindible en 10 minutos. Perfecto para la noche antes o los minutos antes de entrar al examen.</p></div>
      <div class="caja"><div class="etq">La idea clave</div><p class="grande">${md(r.en_30_segundos)}</p></div>
      ${r.datos_clave.length ? `<div class="caja"><div class="etq">Lo que tienes que saberte sí o sí</div>${lista(r.datos_clave.map((d) => `**${d.dato}**${d.explicacion ? ": " + d.explicacion : ""}`))}</div>` : ""}
      ${r.trucos_memoria.length ? `<div class="caja truco"><div class="etq">Tus trucos</div>${lista(r.trucos_memoria.map((x) => `**${x.para}:** ${x.truco}`))}</div>` : ""}
      ${r.errores_tipicos.length ? `<div class="caja cuidado"><div class="etq">Que no te pillen</div>${lista(r.errores_tipicos)}</div>` : ""}
      ${r.preguntas_examen.some((q) => q.probabilidad === "muy_probable") ? `<h2 class="titulo-sec">Las que más pueden caer</h2>${r.preguntas_examen.filter((q) => q.probabilidad === "muy_probable").map((q) => `<details class="caja concepto"><summary>${md(q.pregunta)}</summary>${mdBloque(q.respuesta_modelo)}</details>`).join("")}` : ""}
      <h2 class="titulo-sec">🎯 Lo que aún fallas</h2>
      ${!probadas ? `<div class="caja suave"><p class="peq">Cuando hagas el test, las tarjetas o las preguntas de examen, aquí te junto lo que falles para que lo repases sin perder tiempo.</p></div>`
        : !fallos ? `<div class="caja suave"><p>🌟 Ahora mismo no tienes nada pendiente. ¡Vas muy bien!</p></div>`
        : `${fTest.map((q) => `<div class="caja fallo"><b>${md(q.pregunta)}</b><p>✅ ${md(q.opciones[q.correcta])}</p><p class="peq">${md(q.explicacion)}</p></div>`).join("")}
           ${fTarjetas.map((c) => `<div class="caja fallo"><b>${md(c.frente)}</b><p>✅ ${md(c.reverso)}</p></div>`).join("")}
           ${fPreguntas.map(({ q, h }) => `<details class="caja concepto fallo"><summary>${md(q.pregunta)} <span class="badge nota ${claseNota(h.nota)}">${h.nota}/10</span></summary>${mdBloque(q.respuesta_modelo)}</details>`).join("")}`}`;
  },

  simulacro(z, t) {
    if (simu?.t.id === t.id && simu.enCurso) return pintarSimulacro();
    const h = t.progreso.simulacros;
    z.innerHTML = `<div class="caja centro"><div class="emoji">⏱️</div><h2>Simulacro de examen</h2>
        <p class="peq">Como el examen de verdad: con tiempo, sin mirar nada y con nota al final. Mezcla preguntas tipo test y preguntas para escribir.</p>
        <div class="opciones">
          <button class="opcion" data-a="empezar-simulacro" data-modo="corto"><span>⚡</span>Corto<small class="peq">15 min · 5 de test + 2 para escribir</small></button>
          <button class="opcion" data-a="empezar-simulacro" data-modo="largo"><span>📝</span>Completo<small class="peq">30 min · 8 de test + 4 para escribir</small></button>
        </div></div>
      ${h.length ? `<h2 class="titulo-sec">Tus simulacros</h2><div class="caja">${h.slice(-6).reverse().map((s) => `<div class="dato"><span class="icono">📝</span><div><b class="${claseNota(s.nota)}-txt">${notaTexto(s.nota)}</b><small>${esc(fechaBonita(s.fecha))}</small></div></div>`).join("")}</div>` : ""}`;
  },

  ejercicios(z, t) {
    const DIF = { facil: "Fácil", media: "Media", dificil: "Difícil" };
    z.innerHTML = `
      <div class="caja"><div class="etq">✏️ Corrige mi ejercicio</div><p class="peq">Haz foto a un ejercicio, problema o redacción que hayas hecho tú y te digo la nota, en qué paso fallas y cómo se hace bien.</p>
        <div id="corrector">${htmlCorrector()}</div></div>
      <div class="caja"><div class="etq">🧮 Ejercicios nuevos para practicar</div><p class="peq">Parecidos a los del libro y del examen, de fácil a difícil, con pista y solución.</p>
        <button class="btn" data-a="ejercicios">${t.practica.length ? "Ponme 5 más" : "Ponme 5 ejercicios"}</button></div>
      ${t.practica.map((e, i) => `<article class="caja ejercicio"><div class="badges"><span class="badge ${e.dificultad}">${DIF[e.dificultad] || ""}</span><span class="badge">Ejercicio ${i + 1}</span></div>${mdBloque(e.enunciado)}
        <details><summary>💡 Ver pista</summary>${mdBloque(e.pista)}</details><details><summary>✅ Ver solución</summary>${mdBloque(e.solucion)}</details>
        <button class="btn sec peq" data-a="corregir-este" data-i="${i}">📷 Corregir mi solución</button></article>`).join("")}
      ${t.correcciones.length ? `<h2 class="titulo-sec">Tus correcciones</h2>${t.correcciones.slice().reverse().map(htmlCorreccionFoto).join("")}` : ""}`;
  },

  oral(z, t) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    z.innerHTML = `
      <div class="caja"><p class="peq">Como en un examen oral: elige qué vas a explicar, habla y te digo qué tal lo has hecho.</p>
        <select id="oral-parte">${["Todo el tema", ...t.resumen.apartados.map((a) => a.titulo.replace(/\*\*/g, ""))].map((x) => `<option>${esc(x)}</option>`).join("")}${t.resumen.presentacion.guion.length ? `<option value="__presentacion">Mi presentación</option>` : ""}</select>
        ${SR ? `<button class="btn" data-a="grabar">🎙️ Empezar a hablar</button>` : `<p class="peq">Toca el cuadro de abajo y pulsa el micrófono 🎤 del teclado para dictar.</p>`}
        <textarea id="oral-texto" rows="5" placeholder="Aquí aparece lo que vas diciendo…"></textarea>
        <button class="btn sec" data-a="corregir-oral">✨ Corregir mi explicación</button>
        <div id="oral-res"></div></div>`;
  },

  presentacion(z, t) {
    const pr = t.resumen.presentacion;
    z.innerHTML = `<div class="caja destacada"><div class="etq">Tu presentación · ${pr.duracion_minutos} min</div><p>Léela un par de veces, luego ensáyala en voz alta con el modo ensayo.</p><button class="btn" data-a="ensayo">🎤 Modo ensayo con cronómetro</button></div>
      ${pr.guion.map((g) => `<article class="caja"><div class="ap-cab"><h2>${md(g.parte)}</h2><span class="pag">${esc(g.minutos)}</span></div>${mdBloque(g.que_decir)}</article>`).join("")}
      ${pr.consejos.length ? `<h2 class="titulo-sec">Consejos para exponer</h2><div class="caja">${lista(pr.consejos)}</div>` : ""}
      ${pr.preguntas_del_profe.length ? `<h2 class="titulo-sec">Lo que te puede preguntar el profe</h2>${pr.preguntas_del_profe.map((q) => `<details class="caja concepto"><summary>${md(q.pregunta)}</summary><p>${md(q.respuesta)}</p></details>`).join("")}` : ""}`;
  },

  dudas(z, t) {
    z.innerHTML = `<div class="chat" id="chat">${t.chat.length ? t.chat.map(burbuja).join("") : `<div class="caja suave"><p>Pregúntame lo que no entiendas de este tema. Me sé tus páginas 😉</p></div>`}</div>
      <div class="sugerencias">${SUGERENCIAS.map((s) => `<button class="chip" data-a="sugerencia">${esc(s)}</button>`).join("")}</div>
      <form class="enviar" data-f="chat"><textarea id="msg" rows="2" placeholder="Escribe tu duda…"></textarea><button class="btn" type="submit">Enviar</button></form>`;
  },

  plan(z, t) {
    if (!t.fechaExamen) {
      z.innerHTML = `<div class="caja"><div class="etq">¿Cuándo es el examen?</div><p class="peq">Te organizo qué hacer cada día para llegar con todo sabido y sin agobios.</p><input type="date" id="fecha-plan" min="${hoyISO()}"><button class="btn" data-a="poner-fecha">Crear mi plan</button></div>`;
      return;
    }
    const dias = planDias(t), hoy = hoyISO();
    z.innerHTML = `<div class="caja destacada"><div class="etq">Examen</div><p class="grande">${esc(fechaBonita(t.fechaExamen))} · ${cuandoEs(t.fechaExamen)}</p><button class="enlace-btn" data-a="cambiar-fecha">Cambiar la fecha</button></div>
      <div class="caja"><div class="etq">Que tu móvil te avise</div><p class="peq">Añade el plan a tu Calendario: cada día te saltará un aviso a la hora que elijas con lo que te toca.</p>
        <div class="fila"><input type="time" id="hora-plan" value="${esc(ls.get("repasa:horaEstudio") || "17:30")}"><button class="btn" data-a="calendario-plan">📅 Añadir a mi calendario</button></div></div>
      ${dias.map((d) => `<div class="caja dia ${d.fecha === hoy ? "hoy" : d.fecha < hoy ? "pasado" : ""}">
        <div class="etq">${d.fecha === hoy ? "Hoy" : esc(fechaBonita(d.fecha))}</div>
        ${d.pasos.map(({ k, texto, ir }) => `<label class="paso"><input type="checkbox" data-a="paso" data-k="${k}" ${t.progreso.plan[k] ? "checked" : ""}><span>${esc(texto)}${ir ? ` <button class="enlace-btn" data-a="pestana" data-p="${ir}">Ir</button>` : ""}</span></label>`).join("")}
      </div>`).join("")}`;
  },

  paginas(z, t) {
    if (t.origen?.length) {
      Promise.all(t.origen.map((id) => Almacen.leer(id))).then((fuentes) => {
        z.innerHTML = `<div class="caja"><div class="etq">Hecho juntando estos temas</div>${fuentes.map((f, i) => (f?.resumen ? `<a class="fila-tema enlace sin-caja" href="#/tema/${f.id}"><span class="nombre-tema">${esc(f.resumen.titulo)}</span><span class="flecha">›</span></a>` : `<p class="peq">Tema ${i + 1} (borrado)</p>`)).join("")}</div>
          <button class="btn sec" data-a="reintentar">🔁 Rehacer juntando otra vez</button>
          <button class="btn peligro" data-a="borrar-tema">🗑️ Borrar este tema</button>
          <p class="peq centro">Coste aproximado de este tema: ${(t.coste || 0).toFixed(2).replace(".", ",")} $</p>`;
      });
      return;
    }
    z.innerHTML = `<div class="fotos">${t.fotos.map((f, i) => `<button class="foto" data-a="ver-foto" data-i="${i}"><img src="${verFoto(f)}" alt="Página ${i + 1}"><span class="num">${i + 1}</span></button>`).join("")}</div>
      <label class="btn" for="mas">➕ Añadir páginas y rehacer</label>
      <input type="file" id="mas" accept="image/*" multiple data-fotos="tema" hidden>
      <button class="btn sec" data-a="reintentar">🔁 Rehacer el material con las mismas fotos</button>
      <button class="btn peligro" data-a="borrar-tema">🗑️ Borrar este tema</button>
      <p class="peq centro">Coste aproximado de este tema: ${(t.coste || 0).toFixed(2).replace(".", ",")} $</p>`;
  },
};

// ---------- Plan de estudio ----------
function planDias(t) {
  const pasos = (t.objetivo === "presentacion"
    ? [
        ["Lee el resumen y el guion entero para entenderlo todo.", "presentacion"],
        ["Léete el guion en voz alta dos veces.", "presentacion"],
        ["Ensaya con el cronómetro sin mirar mucho el texto.", "presentacion"],
        ["Prepara las preguntas que te puede hacer el profe.", "presentacion"],
        ["Ensayo final cronometrado, como si fuera de verdad.", "presentacion"],
      ]
    : [
        ["Lee «En 30 segundos» y el resumen entero. Solo entenderlo, sin agobiarte.", "resumen"],
        ["Estudia el esquema y explícalo en voz alta sin mirar.", "esquema"],
        ["Conceptos en modo prueba y una ronda de tarjetas.", "conceptos"],
        ["Haz el test y relee en el resumen lo que falles.", "test"],
        ["Responde por escrito 3 o 4 preguntas de examen y corrígelas.", "examen"],
        ["Tarjetas otra vez + «Cuidado con esto» y los trucos.", "tarjetas"],
        ["Simulacro: todas las «Muy probable» por escrito y sin mirar.", "examen"],
        ["Repaso suave: esquema y tarjetas. Y a dormir pronto 😴", "esquema"],
      ]).map(([texto, ir], k) => ({ k, texto, ir }));
  const inicio = t.planInicio && t.planInicio < t.fechaExamen ? t.planInicio : hoyISO();
  const D = Math.max(1, diasEntre(inicio, t.fechaExamen)); // días de estudio (el del examen no cuenta)
  if (diasHasta(t.fechaExamen) <= 0) return [{ fecha: hoyISO(), pasos: pasos.slice(-3) }];
  const n = pasos.length, dias = {};
  pasos.forEach((p, i) => {
    const d = D >= n ? Math.round((i * (D - 1)) / (n - 1)) : Math.floor((i * D) / n);
    (dias[sumarDias(inicio, d)] ||= []).push(p);
  });
  return Object.entries(dias).sort().map(([fecha, ps]) => ({ fecha, pasos: ps }));
}

// ---------- Tarjetas (repetición espaciada) ----------
let sesion = null;
function empezarSesion(zona, cola, alAcabar) {
  sesion = { zona, cola: barajar(cola), total: cola.length, hechas: 0, girada: false, alAcabar };
  pintarCarta();
}
function pintarCarta() {
  const s = sesion;
  if (!s.cola.length) {
    s.zona.innerHTML = `<div class="caja centro"><div class="emoji">🎉</div><h2>¡Ronda terminada!</h2><p>${s.total} tarjetas repasadas. Mañana te saldrán las que tocan.</p><button class="btn" data-a="fin-tarjetas">Hecho</button></div>`;
    return;
  }
  const { t, i } = s.cola[0], c = t.resumen.tarjetas[i];
  s.zona.innerHTML = `<div class="contador">Quedan ${s.cola.length}${temaVisible?.id !== t.id ? ` · ${esc(t.resumen.titulo)}` : ""}</div>
    <button class="carta ${s.girada ? "girada" : ""}" data-a="girar"><div class="cara">${md(c.frente)}${s.girada ? `<hr><div class="reverso">${md(c.reverso)}</div>` : `<span class="pista">Piensa la respuesta y toca para comprobarla</span>`}</div></button>
    ${s.girada ? `<div class="botones3"><button class="btn mal" data-a="carta" data-n="0">No me la sé</button><button class="btn reg" data-a="carta" data-n="1">Más o menos</button><button class="btn bien" data-a="carta" data-n="2">Me la sé</button></div>` : ""}`;
}
async function responderCarta(nivel) {
  const s = sesion, { t, i } = s.cola.shift();
  const p = t.progreso.tarjetas[i] || { caja: 0 };
  p.caja = nivel === 0 ? 1 : nivel === 1 ? Math.max(1, p.caja) : Math.min(5, p.caja + 1);
  let proxima = sumarDias(hoyISO(), nivel === 0 ? 0 : INTERVALO[p.caja]);
  // Con examen cerca, que vuelva a salir antes del examen
  if (t.fechaExamen && diasHasta(t.fechaExamen) > 1 && proxima >= t.fechaExamen) proxima = sumarDias(t.fechaExamen, -1);
  p.proxima = proxima;
  t.progreso.tarjetas[i] = p;
  if (nivel === 0) s.cola.push({ t, i });
  s.girada = false;
  pintarCarta();
  await Almacen.guardar(t);
  actividad("tarjetas");
}

async function pintarRepaso() {
  const temas = (await Almacen.todos()).filter((t) => t.resumen);
  const cola = temas.flatMap(tarjetasPendientes);
  temaVisible = null;
  app.innerHTML = `${cabecera("Repaso de hoy", "#/", ayudaBtn("repaso"))}<section id="zona"></section>`;
  if (!cola.length) {
    $("#zona").innerHTML = `<div class="caja centro"><div class="emoji">🌟</div><h2>Todo repasado por hoy</h2><p>Vuelve mañana.</p></div>`;
    return;
  }
  empezarSesion($("#zona"), cola);
}

// ---------- Test ----------
let test = null;
function empezarTest(soloFalladas) {
  const t = temaVisible, p = t.progreso.test;
  const indices = soloFalladas && p?.falladas?.length ? p.falladas : t.resumen.test.map((_, i) => i);
  test = { t, completo: !soloFalladas, preguntas: barajar(indices).map((i) => ({ i, ops: barajar(t.resumen.test[i].opciones.map((o, k) => ({ o, k }))) })), pos: 0, aciertos: 0, falladas: [], elegida: null };
  pintarPregunta();
}
function pintarPregunta() {
  const z = $("#zona"), T = test;
  if (T.pos >= T.preguntas.length) return terminarTest();
  const { i, ops } = T.preguntas[T.pos], q = T.t.resumen.test[i], resp = T.elegida != null;
  z.innerHTML = `<div class="contador">Pregunta ${T.pos + 1} de ${T.preguntas.length} · ${T.aciertos} bien</div>
    ${barra((T.pos / T.preguntas.length) * 100)}
    <div class="caja"><h3>${md(q.pregunta)}</h3>
      <div class="test-ops">${ops.map(({ o, k }) => `<button class="test-op ${resp ? (k === q.correcta ? "correcta" : k === T.elegida ? "fallo" : "apagada") : ""}" data-a="opcion" data-k="${k}" ${resp ? "disabled" : ""}>${md(o)}</button>`).join("")}</div>
      ${resp ? `<div class="explica ${T.elegida === q.correcta ? "bien" : "mal"}"><b>${T.elegida === q.correcta ? "¡Bien!" : "No era esa."}</b> ${md(q.explicacion)}</div><button class="btn" data-a="siguiente-test">${T.pos + 1 < T.preguntas.length ? "Siguiente" : "Ver mi nota"}</button>` : ""}
    </div>`;
}
async function terminarTest() {
  const T = test, t = T.t, pct = Math.round((T.aciertos / T.preguntas.length) * 100);
  const p = t.progreso.test || { mejor: 0, intentos: 0 };
  t.progreso.test = { ...p, ultima: pct, mejor: T.completo ? Math.max(p.mejor, pct) : p.mejor, intentos: p.intentos + (T.completo ? 1 : 0), falladas: T.falladas };
  await Almacen.guardar(t);
  actividad(T.completo ? "tests" : null);
  if (T.completo && pct === 100) actividad("dieces");
  const nota = (pct / 10).toFixed(1).replace(".", ",");
  $("#zona").innerHTML = `<div class="caja centro"><div class="emoji">${pct >= 90 ? "🏆" : pct >= 70 ? "💪" : pct >= 50 ? "👍" : "📖"}</div>
    <h2>Un ${nota}</h2><p>${T.aciertos} de ${T.preguntas.length} bien. ${pct >= 90 ? "¡Te lo sabes!" : pct >= 70 ? "Muy bien, repasa las que fallaste." : "Relee el resumen de lo que has fallado y repite."}</p>
    <div class="fila centrada">${T.falladas.length ? `<button class="btn" data-a="empezar-test" data-falladas="1">Repetir las ${T.falladas.length} falladas</button>` : ""}<button class="btn sec" data-a="empezar-test">Test completo</button></div></div>`;
  test = null;
}

// ---------- Examen ----------
const htmlCorreccion = (c) => `<div class="correccion">
  <div class="nota-grande ${claseNota(c.nota)}">${c.nota}<small>/10</small></div>
  ${c.bien.length ? `<div class="etq">Lo que está bien</div>${lista(c.bien)}` : ""}
  ${c.falta.length ? `<div class="etq">Lo que falta para el 10</div>${lista(c.falta)}` : ""}
  ${c.mal.length ? `<div class="etq">Errores</div>${lista(c.mal)}` : ""}
  ${c.respuesta_mejorada ? `<div class="etq">Tu respuesta, mejorada</div>${mdBloque(c.respuesta_mejorada)}` : ""}
  ${c.consejo ? `<p class="consejo">💡 ${md(c.consejo)}</p>` : ""}
</div>`;

async function corregir(boton, i) {
  const t = temaVisible, respuesta = $(`#resp-${i}`).value.trim();
  if (!respuesta) return aviso("Escribe primero tu respuesta");
  boton.disabled = true;
  boton.textContent = "Corrigiendo…";
  try {
    const { datos, coste } = await IA.corregir(t, t.resumen.preguntas_examen[i], respuesta);
    t.progreso.preguntas[i] = { respuesta, nota: datos.nota, correccion: datos };
    t.coste = (t.coste || 0) + coste;
    await Almacen.guardar(t);
    actividad("correcciones");
    if (datos.nota >= 9) actividad("sobresalientes");
    PANELES.examen($("#zona"), t);
    $(`#corr-${i}`).scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    aviso(IA.traducirError(e));
    boton.disabled = false;
    boton.textContent = "✨ Corregir";
  }
}

// ---------- Dudas ----------
const burbuja = (m) => `<div class="burbuja ${m.role === "user" ? "yo" : "ia"}">${m.role === "user" ? md(m.content) : mdBloque(m.content)}</div>`;
let charlando = false;
async function enviarDuda(texto) {
  const t = temaVisible;
  texto = texto.trim();
  if (!texto || charlando) return;
  charlando = true;
  t.chat.push({ role: "user", content: texto });
  const chat = $("#chat");
  if (t.chat.length === 1) chat.innerHTML = "";
  chat.insertAdjacentHTML("beforeend", burbuja({ role: "user", content: texto }) + `<div class="burbuja ia escribiendo">…</div>`);
  $("#msg").value = "";
  const caja = chat.lastElementChild;
  caja.scrollIntoView({ behavior: "smooth", block: "end" });
  let acum = "";
  try {
    const historial = t.chat.slice(-20);
    while (historial[0].role !== "user") historial.shift();
    const { texto: resp, coste } = await IA.charlar(t, historial, (d) => {
      acum += d;
      caja.classList.remove("escribiendo");
      caja.innerHTML = mdBloque(acum);
    });
    t.chat.push({ role: "assistant", content: resp });
    caja.innerHTML = mdBloque(resp);
    t.coste = (t.coste || 0) + coste;
    await Almacen.guardar(t);
    actividad();
  } catch (e) {
    t.chat.pop();
    caja.classList.add("error");
    caja.textContent = IA.traducirError(e);
  }
  charlando = false;
}

// ---------- Modo ensayo (presentación) ----------
function abrirEnsayo() {
  const pr = temaVisible.resumen.presentacion, inicio = Date.now();
  const d = document.createElement("div");
  d.className = "ensayo";
  d.innerHTML = `<div class="ensayo-cab"><span id="crono">0:00</span><span class="peq">objetivo ${pr.duracion_minutos}:00</span><button class="btn sec" data-a="cerrar-ensayo">Cerrar</button></div>
    <div class="ensayo-texto">${pr.guion.map((g) => `<h2>${md(g.parte)} <small>${esc(g.minutos)}</small></h2>${mdBloque(g.que_decir)}`).join("")}</div>`;
  document.body.append(d);
  const reloj = setInterval(() => {
    const c = $("#crono");
    if (!c) return clearInterval(reloj);
    const s = Math.floor((Date.now() - inicio) / 1000);
    c.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    c.classList.toggle("pasado", s > pr.duracion_minutos * 60);
  }, 500);
}

// ---------- Notas ----------
const claseNota = (n) => (n >= 7 ? "bien" : n >= 5 ? "reg" : "mal");
const notaTexto = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",").replace(",0", "");

// ---------- Corregir un ejercicio por foto (en un tema o suelto) ----------
let fotosCorregir = [];
let enunciadoCorregir = "";
const htmlCorrector = () => `
  <textarea id="cor-enunciado" rows="2" placeholder="Enunciado (si no sale en la foto)">${esc(enunciadoCorregir)}</textarea>
  ${fotosCorregir.length ? `<div class="fotos">${fotosCorregir.map((f, i) => `<div class="foto"><img src="${verFoto(f)}" alt="Foto ${i + 1}"><span class="num">${i + 1}</span><button class="quitar" data-a="quitar-cor" data-i="${i}" aria-label="Quitar">✕</button></div>`).join("")}</div>` : ""}
  <div class="fila"><label class="btn sec" for="cor-cam">📷 Hacer foto</label><label class="btn sec" for="cor-gal">🖼️ De la galería</label></div>
  <input type="file" id="cor-cam" accept="image/*" capture="environment" data-fotos="corregir" hidden>
  <input type="file" id="cor-gal" accept="image/*" multiple data-fotos="corregir" hidden>
  <div id="cargando-fotos"></div>
  <button class="btn ancho" data-a="corregir-foto" ${fotosCorregir.length ? "" : "disabled"}>✨ Corregir</button>`;

const htmlCorreccionFoto = (c) => `<div class="caja correccion-foto">
  <div class="ap-cab"><div class="nota-grande ${claseNota(c.nota)}">${c.nota}<small>/10</small></div><span class="pag">${esc(fechaBonita(c.fecha))}</span></div>
  ${c.enunciado_leido ? `<p class="peq">${md(c.enunciado_leido)}</p>` : ""}
  <p>${md(c.resumen)}</p>
  ${c.pasos.length ? `<div class="etq">Paso a paso</div>${c.pasos.map((p) => `<div class="paso-cor ${p.bien ? "bien" : "mal"}"><span>${p.bien ? "✓" : "✗"}</span><div>${md(p.paso)}${p.comentario ? `<small>${md(p.comentario)}</small>` : ""}</div></div>`).join("")}` : ""}
  ${c.errores.length ? `<div class="etq">Fallos para no repetir</div>${lista(c.errores)}` : ""}
  ${c.solucion ? `<details><summary>✅ Cómo se hace bien</summary>${mdBloque(c.solucion)}</details>` : ""}
  ${c.consejo ? `<p class="consejo">💡 ${md(c.consejo)}</p>` : ""}
</div>`;

async function corregirFotoAccion(b) {
  const t = temaVisible;
  enunciadoCorregir = $("#cor-enunciado")?.value || "";
  b.disabled = true;
  b.textContent = "Corrigiendo… (puede tardar un minuto)";
  try {
    const { datos, coste } = await IA.corregirFoto(t, await Promise.all(fotosCorregir.map(aBase64)), enunciadoCorregir.trim());
    const c = { ...datos, fecha: hoyISO() };
    fotosCorregir = [];
    enunciadoCorregir = "";
    if (t) {
      t.correcciones.push(c);
      t.coste = (t.coste || 0) + coste;
      await Almacen.guardar(t);
    } else ls.set("repasa:correcciones", JSON.stringify([...leerJSON("repasa:correcciones", []), c].slice(-20)));
    if (c.tipo !== "otro") actividad("correcciones");
    if (c.tipo !== "otro" && c.nota >= 9) actividad("sobresalientes");
    await pintar();
    $(".correccion-foto")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    aviso(IA.traducirError(e));
    b.disabled = false;
    b.textContent = "✨ Corregir";
  }
}

function pintarCorregirSuelto() {
  temaVisible = null;
  const hist = leerJSON("repasa:correcciones", []);
  app.innerHTML = `${cabecera("Corregir un ejercicio", "#/", ayudaBtn("corregir"))}
    <div class="caja"><p class="peq">Haz foto a un ejercicio, problema, redacción o respuesta que hayas hecho tú y te lo corrijo: nota, en qué fallas y cómo se hace bien. Si es de un tema que ya tienes, mejor desde el tema (pestaña Practicar), porque así me sé tu libro.</p>
      <div id="corrector">${htmlCorrector()}</div></div>
    ${hist.length ? `<h2 class="titulo-sec">Correcciones anteriores</h2>${hist.slice().reverse().map(htmlCorreccionFoto).join("")}` : ""}`;
}

// ---------- Simulacro de examen ----------
let simu = null;
function empezarSimulacro(modo) {
  const t = temaVisible, r = t.resumen;
  const [nt, ne, min] = modo === "largo" ? [8, 4, 30] : [5, 2, 15];
  const test = barajar(r.test.map((_, i) => i)).slice(0, nt).map((i) => ({ i, ops: barajar(r.test[i].opciones.map((o, k) => ({ o, k }))), elegida: null }));
  const pr = r.preguntas_examen.map((q, i) => ({ q, i }));
  const escritas = [...barajar(pr.filter((x) => x.q.probabilidad === "muy_probable")), ...barajar(pr.filter((x) => x.q.probabilidad !== "muy_probable"))].slice(0, ne).map((x) => ({ i: x.i, respuesta: "" }));
  clearInterval(simu?.reloj);
  simu = { t, test, escritas, min, fin: Date.now() + min * 60000, enCurso: true };
  pintarSimulacro();
  simu.reloj = setInterval(() => {
    if (!simu?.enCurso) return;
    const s = Math.max(0, Math.round((simu.fin - Date.now()) / 1000)), c = $("#simu-reloj");
    if (c) {
      c.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      c.classList.toggle("urgente", s < 120);
    }
    if (!s) {
      aviso("¡Se acabó el tiempo! Corrigiendo…");
      entregarSimulacro();
    }
  }, 500);
  window.scrollTo(0, 0);
}
function pintarSimulacro() {
  const S = simu, r = S.t.resumen;
  $("#zona").innerHTML = `<div class="reloj-simu"><span>⏱️ <b id="simu-reloj">${S.min}:00</b></span><button class="btn peq" data-a="entregar-simulacro">Entregar</button></div>
    ${S.test.length ? `<h2 class="titulo-sec">Parte 1 · Test</h2>` : ""}
    ${S.test.map((x, n) => `<div class="caja"><h3>${n + 1}. ${md(r.test[x.i].pregunta)}</h3><div class="test-ops">${x.ops.map(({ o, k }) => `<button class="test-op ${x.elegida === k ? "marcada" : ""}" data-a="simu-op" data-n="${n}" data-k="${k}">${md(o)}</button>`).join("")}</div></div>`).join("")}
    ${S.escritas.length ? `<h2 class="titulo-sec">Parte 2 · Para escribir</h2>` : ""}
    ${S.escritas.map((x, n) => `<div class="caja"><h3>${S.test.length + n + 1}. ${md(r.preguntas_examen[x.i].pregunta)}</h3><textarea data-simu="${n}" rows="6" placeholder="Tu respuesta…">${esc(x.respuesta)}</textarea></div>`).join("")}
    <button class="btn enorme" data-a="entregar-simulacro">Entregar el examen</button>`;
}
async function entregarSimulacro() {
  const S = simu;
  if (!S?.enCurso) return;
  S.enCurso = false;
  clearInterval(S.reloj);
  const t = S.t, r = t.resumen;
  const aciertos = S.test.filter((x) => x.elegida === r.test[x.i].correcta).length;
  const dentro = () => temaVisible?.id === t.id && $("#zona");
  if (dentro()) $("#zona").innerHTML = `<div class="trabajando"><div class="orbe">📝</div><h2>Corrigiendo tu examen…</h2><p class="peq">Un momento, como si fuera el profe.</p></div>`;
  let corr = null, fallo = "";
  if (S.escritas.length)
    try {
      const res = await IA.corregirSimulacro(t, S.escritas.map((x) => ({ ...r.preguntas_examen[x.i], respuesta: x.respuesta })));
      corr = res.datos;
      t.coste = (t.coste || 0) + res.coste;
    } catch (e) {
      fallo = IA.traducirError(e);
    }
  const pTest = S.test.length ? (aciertos / S.test.length) * 10 : null;
  const pEsc = corr ? S.escritas.reduce((a, _, n) => a + (corr.correcciones[n]?.nota || 0), 0) / S.escritas.length : null;
  // El test vale el 40 % y lo escrito el 60 %, como en muchos exámenes de la ESO
  const nota = pTest != null && pEsc != null ? pTest * 0.4 + pEsc * 0.6 : pTest ?? pEsc ?? 0;
  t.progreso.simulacros.push({ fecha: hoyISO(), nota: Math.round(nota * 10) / 10 });
  await Almacen.guardar(t);
  actividad("simulacros");
  if (nota >= 9) actividad("sobresalientes");
  simu = null;
  if (!dentro()) return aviso(`Simulacro corregido: un ${notaTexto(nota)}`);
  $("#zona").innerHTML = `<div class="caja centro"><div class="emoji">${nota >= 9 ? "🏆" : nota >= 7 ? "💪" : nota >= 5 ? "👍" : "📖"}</div>
      <h2>Un ${notaTexto(nota)}</h2>
      <p class="peq">${pTest != null ? `Test: ${aciertos} de ${S.test.length} (${notaTexto(pTest)})` : ""}${pTest != null && pEsc != null ? " · " : ""}${pEsc != null ? `Preguntas escritas: ${notaTexto(pEsc)}` : ""}</p>
      ${corr?.comentario_general ? `<p>${md(corr.comentario_general)}</p>` : ""}
      ${fallo ? `<p class="peq">No se han podido corregir las preguntas escritas (${esc(fallo)}). La nota es solo del test.</p>` : ""}
      <button class="btn" data-a="pestana" data-p="simulacro">Volver</button></div>
    ${S.test.length ? `<h2 class="titulo-sec">El test, revisado</h2>${S.test.map((x, n) => { const q = r.test[x.i], ok = x.elegida === q.correcta; return `<div class="caja"><h3>${ok ? "✅" : "❌"} ${n + 1}. ${md(q.pregunta)}</h3>${ok ? "" : `<p class="peq">Tu respuesta: ${x.elegida == null ? "en blanco" : md(q.opciones[x.elegida])}</p>`}<p><b>Correcta:</b> ${md(q.opciones[q.correcta])}</p><p class="peq">${md(q.explicacion)}</p></div>`; }).join("")}` : ""}
    ${S.escritas.length ? `<h2 class="titulo-sec">Las preguntas escritas</h2>${S.escritas.map((x, n) => { const q = r.preguntas_examen[x.i], c = corr?.correcciones[n]; return `<div class="caja"><div class="badges">${c ? `<span class="badge nota ${claseNota(c.nota)}">${c.nota}/10</span>` : ""}</div><h3>${md(q.pregunta)}</h3>${c ? `<p>${md(c.comentario)}</p>` : ""}<details><summary>Ver la respuesta de 10</summary>${mdBloque(q.respuesta_modelo)}</details></div>`; }).join("")}` : ""}`;
  window.scrollTo(0, 0);
}

// ---------- Explicar en voz alta ----------
let grabacion = null;
function grabar(b) {
  if (grabacion) return grabacion.stop();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = VOZ[temaVisible?.idioma] || "es-ES";
  rec.continuous = true;
  rec.interimResults = true;
  const area = $("#oral-texto"), base = area.value ? area.value + " " : "";
  rec.onresult = (e) => (area.value = base + Array.from(e.results).map((r) => r[0].transcript).join(" "));
  rec.onerror = (e) => aviso(e.error === "not-allowed" ? "Hace falta permiso para usar el micrófono" : e.error === "no-speech" ? "No te he oído. Prueba otra vez" : "El micrófono ha fallado. Usa el 🎤 del teclado");
  rec.onend = () => {
    grabacion = null;
    b.textContent = "🎙️ Seguir hablando";
    b.classList.remove("grabando");
  };
  try {
    rec.start();
    grabacion = rec;
    b.textContent = "⏹️ He terminado";
    b.classList.add("grabando");
  } catch {
    aviso("No se puede usar el micrófono aquí. Usa el 🎤 del teclado");
  }
}

async function corregirOralAccion(b) {
  const t = temaVisible, texto = $("#oral-texto").value.trim();
  if (texto.split(/\s+/).length < 8) return aviso("Explica un poco más (al menos un par de frases)");
  grabacion?.stop();
  const sel = $("#oral-parte").value;
  const pr = t.resumen.presentacion;
  const parte = sel === "__presentacion" ? `Su presentación oral (${pr.duracion_minutos} min). Guion que preparó:\n${pr.guion.map((g) => `${g.parte}: ${g.que_decir}`).join("\n")}` : sel;
  b.disabled = true;
  b.textContent = "Escuchando lo que has dicho…";
  try {
    const { datos, coste } = await IA.corregirOral(t, parte, texto);
    t.coste = (t.coste || 0) + coste;
    await Almacen.guardar(t);
    actividad("orales");
    if (datos.nota >= 9) actividad("sobresalientes");
    $("#oral-res").innerHTML = htmlCorreccion({ ...datos, respuesta_mejorada: "" }) + (datos.como_lo_dices ? `<div class="correccion"><div class="etq">Cómo lo cuentas</div><p>${md(datos.como_lo_dices)}</p></div>` : "");
  } catch (e) {
    aviso(IA.traducirError(e));
  }
  b.disabled = false;
  b.textContent = "✨ Corregir mi explicación";
}

// ---------- Escuchar en voz alta ----------
function escuchar(b) {
  const ss = window.speechSynthesis;
  if (!ss) return aviso("Este móvil no puede leer en voz alta");
  b.dataset.texto ||= b.textContent;
  if (ss.speaking) {
    ss.cancel();
    b.textContent = b.dataset.texto;
    return;
  }
  const t = temaVisible, r = t.resumen, limpio = (s) => String(s || "").replace(/\*\*/g, "").replace(/^\s*[-•]\s*/gm, "");
  const trozos = (b.dataset.que === "traduccion"
    ? r.traduccion.flatMap((p) => limpio(p.texto).split(/\n+/))
    : [limpio(r.en_30_segundos), ...r.apartados.flatMap((a) => [limpio(a.titulo) + ".", ...a.ideas.map(limpio)])]
  ).filter((x) => x.trim());
  const lang = VOZ[t.idioma] || "es-ES", voces = ss.getVoices();
  const voz = voces.find((v) => v.lang.replace("_", "-") === lang) || voces.find((v) => v.lang.startsWith(lang.slice(0, 2)));
  // Frase a frase: en el iPhone los textos muy largos se cortan
  trozos.forEach((x, i) => {
    const u = new SpeechSynthesisUtterance(x);
    u.lang = lang;
    if (voz) u.voice = voz;
    u.rate = 0.95;
    if (i === trozos.length - 1) u.onend = () => (b.textContent = b.dataset.texto);
    ss.speak(u);
  });
  b.textContent = "⏹️ Parar";
}

// ---------- Archivos: calendario y copia de seguridad ----------
async function compartirArchivo(nombre, contenido, tipo) {
  const archivo = new File([contenido], nombre, { type: tipo });
  if (navigator.canShare?.({ files: [archivo] }))
    try {
      return await navigator.share({ files: [archivo], title: nombre });
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(archivo);
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function calendario(eventos) {
  const e = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => "\\" + m);
  const ahora = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const l = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Repasa//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const ev of eventos) {
    l.push("BEGIN:VEVENT", `UID:${nuevoId()}@repasa`, `DTSTAMP:${ahora}`);
    if (ev.todoElDia) l.push(`DTSTART;VALUE=DATE:${ev.fecha.replace(/-/g, "")}`);
    else l.push(`DTSTART:${ev.fecha.replace(/-/g, "")}T${ev.hora.replace(":", "")}00`, `DURATION:PT${ev.minutos || 45}M`);
    if (ev.diario) l.push("RRULE:FREQ=DAILY");
    l.push(`SUMMARY:${e(ev.titulo)}`, `DESCRIPTION:${e(ev.desc)}`, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${e(ev.titulo)}`, `TRIGGER:${ev.todoElDia ? "-PT15H" : "PT0M"}`, "END:VALARM", "END:VEVENT");
  }
  l.push("END:VCALENDAR");
  // Abrir el archivo hace que el iPhone ofrezca «Añadir todo» al Calendario
  const url = URL.createObjectURL(new Blob([l.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
  location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const base64ABlob = (b64) => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
};
const AJUSTES_COPIA = ["repasa:nombre", "repasa:emoji", "repasa:color", "repasa:dias", "repasa:stats", "repasa:logros", "repasa:correcciones", "repasa:horaEstudio", "repasa:ocultarConceptos", "repasa:gustos", "repasa:mensaje", "repasa:examenes"];

async function exportarCopia(b) {
  b.disabled = true;
  b.textContent = "Preparando…";
  try {
    const temas = await Almacen.todos();
    const datos = {
      app: "repasa", version: 1, fecha: new Date().toISOString(),
      ajustes: Object.fromEntries(AJUSTES_COPIA.map((k) => [k, ls.get(k)])),
      temas: await Promise.all(temas.map(async (t) => ({ ...t, fotos: await Promise.all(t.fotos.map(aBase64)) }))),
      libros: await Promise.all((await Almacen.libros.todos()).map(async (l) => ({ ...l, portada: l.portada ? await aBase64(l.portada) : null, paginas: await Promise.all(l.paginas.map(async (p) => ({ ...p, foto: await aBase64(p.foto) }))) }))),
    };
    await compartirArchivo(`repasa-copia-${hoyISO()}.json`, JSON.stringify(datos), "application/json");
    ls.set("repasa:ultimaCopia", hoyISO());
  } catch (e) {
    aviso("No se ha podido hacer la copia: " + (e.message || e));
  }
  b.disabled = false;
  b.textContent = "💾 Hacer copia";
}

async function importarCopia(input) {
  const f = input.files[0];
  input.value = "";
  if (!f) return;
  let d;
  try {
    d = JSON.parse(await f.text());
    if (d.app !== "repasa" || !Array.isArray(d.temas)) throw new Error();
  } catch {
    return aviso("Ese archivo no es una copia de Repasa");
  }
  const libros = d.libros || [];
  if (!confirm(`¿Recupero ${d.temas.length} temas${libros.length ? ` y ${libros.length} libros` : ""} de la copia del ${new Date(d.fecha).toLocaleDateString("es-ES")}? Lo que ya tienes se queda.`)) return;
  for (const t of d.temas) await Almacen.guardar({ ...t, fotos: t.fotos.map(base64ABlob) });
  for (const l of libros) await Almacen.libros.guardar({ ...l, portada: l.portada ? base64ABlob(l.portada) : null, paginas: l.paginas.map((p) => ({ ...p, foto: base64ABlob(p.foto) })) });
  for (const [k, v] of Object.entries(d.ajustes || {})) if (v != null) ls.set(k, v);
  aplicarColor();
  aviso("Copia recuperada ✅");
  ir("#/");
}

// ---------- Juntar temas ----------
let combinacion = null;
async function pintarCombinar() {
  const temas = (await Almacen.todos()).filter((t) => t.resumen && t.objetivo !== "traducir" && !t.origen?.length).sort((a, b) => a.resumen.asignatura.localeCompare(b.resumen.asignatura));
  combinacion ||= { ids: [], objetivo: "examen", fecha: "", notas: "" };
  const c = combinacion;
  app.innerHTML = `${cabecera("Juntar temas", "#/", ayudaBtn("juntar"))}
    <p class="intro">Para los exámenes en los que entran varios temas: elige cuáles y te preparo un solo material que los mezcla (resumen, esquema, test, preguntas, simulacro…).</p>
    ${temas.length < 2 ? `<div class="vacio">Necesitas al menos 2 temas creados para poder juntarlos.</div>` : `
    <div class="caja"><div class="etq">1. ¿Qué temas entran?</div>${temas.map((t) => `<label class="paso"><input type="checkbox" data-comb="${t.id}" ${c.ids.includes(t.id) ? "checked" : ""}><span><b>${esc(t.resumen.titulo)}</b><small class="bloque">${esc(t.resumen.asignatura)}</small></span></label>`).join("")}</div>
    <div class="caja"><div class="etq">2. ¿Para qué lo necesitas?</div>
      <div class="opciones">${Object.entries(OBJETIVOS).map(([k, o]) => `<button class="opcion ${c.objetivo === k ? "activa" : ""}" data-a="objetivo-comb" data-k="${k}"><span>${o.icono}</span>${o.nombre}</button>`).join("")}</div>
      <label class="etq" for="fecha">¿Cuándo es el examen? <span class="opc">(opcional)</span></label>
      <input type="date" id="fecha" min="${hoyISO()}" value="${esc(c.fecha)}">
      <label class="etq" for="notas">¿Algo que haya dicho el profe? <span class="opc">(opcional)</span></label>
      <textarea id="notas" rows="2" placeholder="Ej.: es el examen de la 1.ª evaluación, entran los temas 1, 2 y 3">${esc(c.notas)}</textarea></div>
    <button class="btn enorme" data-a="crear-combinado">🧩 Juntar y preparar</button>`}`;
}

// ---------- Mis libros ----------
const hastaPag = (p) => (p.doble ? p.num + 1 : p.num);
// «10-24, 40-52»: las páginas que tiene guardadas
function paginasTexto(l) {
  const nums = [...new Set(l.paginas.filter((p) => p.num).flatMap((p) => (p.doble ? [p.num, p.num + 1] : [p.num])))].sort((a, b) => a - b);
  const tramos = [];
  for (const n of nums) {
    const u = tramos.at(-1);
    if (u && n === u[1] + 1) u[1] = n;
    else tramos.push([n, n]);
  }
  return tramos.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");
}

async function pintarLibros() {
  const libros = (await Almacen.libros.todos()).sort((a, b) => (a.asignatura || "").localeCompare(b.asignatura || ""));
  app.innerHTML = `${cabecera("Mis libros", "#/", ayudaBtn("libros"))}
    <p class="intro">Guarda aquí las páginas de tus libros una sola vez. Luego, para estudiar, eliges «páginas 40 a 52» y listo, sin volver a hacer fotos.</p>
    ${libros.map((l) => `<a class="caja enlace libro-fila" href="#/libro/${l.id}">${l.portada ? `<img class="portada" src="${verFoto(l.portada)}" alt="">` : `<span class="emoji">📘</span>`}<span class="nombre-tema">${esc(l.titulo || "Libro")}<small>${esc([l.asignatura, l.curso].filter(Boolean).join(" · "))}</small><small>${l.paginas.length ? `Páginas: ${esc(paginasTexto(l) || "sin número")}` : "Aún sin páginas"}</small></span><span class="flecha">›</span></a>`).join("")}
    <div class="caja"><div class="etq">Añadir un libro</div><p class="peq">Haz una foto a la portada y lo reconozco.</p>
      <div class="fila"><label class="btn" for="por-cam">📷 Foto a la portada</label><label class="btn sec" for="por-gal">🖼️ De la galería</label></div>
      <input type="file" id="por-cam" accept="image/*" capture="environment" data-fotos="portada" hidden>
      <input type="file" id="por-gal" accept="image/*" data-fotos="portada" hidden>
      <div id="cargando-fotos"></div></div>`;
}

async function nuevoLibro(portada) {
  if (!IA.tieneClave()) return aviso("Primero hay que poner la clave en Ajustes");
  const z = $("#cargando-fotos");
  if (z) z.innerHTML = `<p class="peq">Mirando la portada…</p>`;
  const l = { id: nuevoId(), creado: Date.now(), portada, titulo: "", asignatura: "", editorial: "", curso: "", paginas: [] };
  try {
    Object.assign(l, (await IA.identificarLibro(await aBase64(portada))).datos);
  } catch (e) {
    aviso("No he podido leer la portada. Ponle tú el nombre con ✏️");
  }
  l.titulo ||= l.asignatura || "Mi libro";
  await Almacen.libros.guardar(l);
  ir(`#/libro/${l.id}`);
}

let libroVisible = null;
async function pintarLibro(id) {
  const l = await Almacen.libros.leer(id);
  if (!l) return ir("#/libros");
  libroVisible = l;
  l.paginas.sort((a, b) => (a.num || 1e9) - (b.num || 1e9));
  const primera = l.paginas.find((p) => p.num)?.num || "";
  let ultima = primera; // hasta donde llegan seguidas las páginas guardadas
  for (const p of l.paginas) if (p.num && p.num <= ultima + 1) ultima = Math.max(ultima, hastaPag(p));
  app.innerHTML = `${cabecera(l.titulo, "#/libros", `<button class="icono-btn" data-a="editar-libro" aria-label="Cambiar nombre">✏️</button>${ayudaBtn("libros")}`)}
    <div class="sub-cab">${esc([l.asignatura, l.editorial, l.curso].filter(Boolean).join(" · "))}</div>
    ${l.paginas.length ? `<div class="caja destacada"><div class="etq">Estudiar unas páginas</div>
      <p class="peq">Tienes guardadas: ${esc(paginasTexto(l) || "páginas sin número")}</p>
      <div class="rango"><label>Desde la página<input type="number" id="pag-desde" inputmode="numeric" value="${primera}"></label><label>Hasta la<input type="number" id="pag-hasta" inputmode="numeric" value="${ultima}"></label></div>
      <button class="btn ancho" data-a="tema-de-libro">✨ Crear el tema con esas páginas</button></div>` : ""}
    <div class="caja"><div class="etq">Guardar páginas</div>
      <p class="peq">Una foto por página (o el libro abierto con dos). Leo el número de cada una y las guardo en orden. Si repites una página, se cambia por la nueva.</p>
      <p class="peq"><b>Más rápido:</b> haz las fotos con la cámara del móvil y luego elígelas todas juntas desde la galería.</p>
      <div class="fila"><label class="btn sec" for="lib-gal">🖼️ Elegir de la galería</label><label class="btn sec" for="lib-cam">📷 Hacer foto</label></div>
      <input type="file" id="lib-gal" accept="image/*" multiple data-fotos="libro" hidden>
      <input type="file" id="lib-cam" accept="image/*" capture="environment" data-fotos="libro" hidden>
      <div id="cargando-fotos"></div></div>
    ${l.paginas.length ? `<h2 class="titulo-sec">Páginas guardadas</h2><div class="fotos">${l.paginas.map((p, i) => `<button class="foto" data-a="pagina-libro" data-i="${i}"><img src="${verFoto(p.foto)}" alt="Página ${p.num || "sin número"}"><span class="num ${p.num ? "" : "sin"}">${p.num ? (p.doble ? `${p.num}-${p.num + 1}` : p.num) : "¿?"}</span></button>`).join("")}</div>
      <p class="peq">Toca una página para cambiarle el número o borrarla.</p>` : ""}
    <button class="btn peligro" data-a="borrar-libro">Borrar este libro</button>`;
}

async function guardarPaginasLibro(archivos) {
  const l = libroVisible, z = $("#cargando-fotos");
  if (!IA.tieneClave()) return aviso("Primero hay que poner la clave en Ajustes");
  if (archivos.length > 40) return aviso("Como mucho 40 fotos cada vez");
  let sinNumero = 0, hechas = 0;
  // De 10 en 10: así no pesa demasiado cada envío
  for (let i = 0; i < archivos.length; i += 10) {
    const grupo = archivos.slice(i, i + 10);
    if (z) z.innerHTML = `<p class="peq">Guardando páginas… ${hechas} de ${archivos.length}</p>${barra((hechas / archivos.length) * 100)}`;
    const fotos = [], pequenas = [];
    for (const f of grupo) {
      try {
        fotos.push(await comprimir(f));
        pequenas.push(await aBase64(await comprimir(f, 1200)));
      } catch (e) {
        aviso(e.message);
      }
    }
    let numeros = [];
    try {
      numeros = (await IA.numerarPaginas(pequenas)).datos.paginas;
    } catch (e) {
      aviso(IA.traducirError(e));
    }
    fotos.forEach((foto, k) => {
      const n = numeros.find((x) => x.foto === k + 1);
      const p = { foto, num: n?.visible && n.numero > 0 ? n.numero : null, doble: !!n?.doble };
      if (!p.num) sinNumero++;
      const igual = p.num ? l.paginas.findIndex((x) => x.num === p.num) : -1;
      if (igual >= 0) l.paginas[igual] = p;
      else l.paginas.push(p);
    });
    hechas += grupo.length;
    await Almacen.libros.guardar(l);
  }
  aviso(sinNumero ? `Guardadas. ${sinNumero} sin número: tócalas para ponérselo` : `${hechas} fotos guardadas ✅`);
  pintar();
}

function temaDeLibro() {
  const l = libroVisible, d = parseInt($("#pag-desde").value, 10), h = parseInt($("#pag-hasta").value, 10) || d;
  if (!d) return aviso("Pon desde qué página");
  const [a, b] = d <= h ? [d, h] : [h, d];
  const sel = l.paginas.filter((p) => p.num && p.num <= b && hastaPag(p) >= a);
  if (!sel.length) return aviso(`No tengo guardada ninguna página entre la ${a} y la ${b}`);
  if (sel.length > MAX_FOTOS) return aviso(`Son ${sel.length} fotos y el máximo por tema es ${MAX_FOTOS}. Divídelo en dos temas.`);
  const faltan = [];
  for (let n = a; n <= b; n++) if (!sel.some((p) => n >= p.num && n <= hastaPag(p))) faltan.push(n);
  if (faltan.length && !confirm(`No tengo guardadas las páginas ${faltan.join(", ")}. ¿Creo el tema sin ellas?`)) return;
  const examen = borrador?.examenId ? { examenId: borrador.examenId, para: borrador.para, fecha: borrador.fecha, notas: borrador.notas } : {};
  borrador = {
    traducir: false, fotos: sel.map((p) => p.foto), objetivo: "examen", idioma: "Español", fecha: "", notas: "", ...examen,
    deLibro: `${l.titulo}, páginas ${a}-${b}`, contextoLibro: `Libro: ${l.titulo}${l.editorial ? ` (${l.editorial})` : ""}, páginas ${a} a ${b}.`,
  };
  ir("#/nuevo");
}

// ---------- Modo concentración ----------
let foco = null;
let audio = null;
const minutosHoy = () => { const m = leerJSON("repasa:focoHoy", {}); return m.fecha === hoyISO() ? m.min : 0; };
function sonar() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.3, 0.6].forEach((t) => {
      const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + t;
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g).connect(audio.destination);
      o.start(t0);
      o.stop(t0 + 0.27);
    });
    navigator.vibrate?.(400);
  } catch {}
}

function pintarConcentrar() {
  if (!foco) {
    app.innerHTML = `${cabecera("Concentrarme", "#/", ayudaBtn("concentrar"))}
      <div class="caja"><p>Estudia a tope un rato y luego descansa. Es la forma de rendir más sin agotarte.</p>
        <ul><li>Pon el móvil en <b>No molestar</b> 🌙</li><li>Deja esta pantalla abierta: te aviso con un sonido</li><li>Ten delante lo que vas a estudiar</li></ul></div>
      <div class="opciones">
        <button class="opcion" data-a="foco" data-e="25" data-d="5"><span>⏱️</span>25 + 5<small class="peq">25 min estudiando, 5 de descanso</small></button>
        <button class="opcion" data-a="foco" data-e="45" data-d="10"><span>🔥</span>45 + 10<small class="peq">Para las tardes de examen</small></button>
      </div>
      <p class="peq centro">Hoy llevas ${minutosHoy()} minutos de concentración.</p>`;
    return;
  }
  app.innerHTML = `<div class="foco ${foco.fase}">
    <div class="foco-fase">${foco.fase === "estudio" ? "Estudiando" : "Descanso"}</div>
    <div class="foco-reloj"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="anillo-fondo"/><circle cx="60" cy="60" r="54" class="anillo" id="anillo"/></svg><div class="foco-tiempo" id="foco-tiempo">--:--</div></div>
    <p class="foco-texto">${foco.fase === "estudio" ? "Nada de móvil hasta que suene 🙂" : "Levántate, bebe agua y estira. Ahora sí puedes mirar el móvil."}</p>
    <div class="foco-bloques">Bloques terminados: <b>${foco.bloques}</b> · hoy ${minutosHoy()} min</div>
    <div class="fila centrada"><button class="btn sec" data-a="foco-pausa">${foco.restante != null ? "▶️ Seguir" : "⏸️ Pausa"}</button><button class="btn sec" data-a="foco-fin">Terminar</button></div>
  </div>`;
  tickFoco();
}

function tickFoco() {
  if (!foco) return;
  const total = (foco.fase === "estudio" ? foco.estudio : foco.descanso) * 60000;
  const queda = foco.restante ?? Math.max(0, foco.fin - Date.now());
  const t = $("#foco-tiempo"), a = $("#anillo");
  if (t) {
    const s = Math.ceil(queda / 1000), L = 2 * Math.PI * 54;
    t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    a.style.strokeDasharray = L;
    a.style.strokeDashoffset = L * (1 - queda / total);
  }
  if (foco.restante == null && queda <= 0) finFase();
}

function finFase() {
  sonar();
  if (foco.fase === "estudio") {
    foco.bloques++;
    const m = leerJSON("repasa:focoHoy", {});
    ls.set("repasa:focoHoy", JSON.stringify({ fecha: hoyISO(), min: (m.fecha === hoyISO() ? m.min : 0) + foco.estudio }));
    actividad("concentracion");
    foco.fase = "descanso";
    aviso("¡Bloque terminado! Toca descansar 🙌");
  } else {
    foco.fase = "estudio";
    aviso("Fin del descanso: ¡a por otro bloque!");
  }
  foco.fin = Date.now() + (foco.fase === "estudio" ? foco.estudio : foco.descanso) * 60000;
  if (location.hash === "#/concentrar") pintarConcentrar();
}

async function empezarFoco(estudio, descanso) {
  audio ||= new (window.AudioContext || window.webkitAudioContext)(); // se activa con el toque para poder sonar luego
  audio.resume?.();
  let bloqueo = null;
  try { bloqueo = await navigator.wakeLock?.request("screen"); } catch {}
  foco = { estudio, descanso, fase: "estudio", fin: Date.now() + estudio * 60000, restante: null, bloques: 0, bloqueo, reloj: setInterval(tickFoco, 500) };
  pintarConcentrar();
}

// ---------- Guía completa («Cómo funciona») ----------
const htmlAyuda = (k, abierto) => {
  const a = AYUDA[k];
  return `<details class="caja ayuda" id="ay-${k}" ${abierto ? "open" : ""}><summary><span class="emoji">${a.icono}</span><b>${esc(a.titulo)}</b></summary>
    <p>${md(a.que)}</p>
    ${a.cuando ? `<p class="peq"><b>Cuándo:</b> ${md(a.cuando)}</p>` : ""}
    <div class="etq">Cómo se hace</div>
    <ol>${a.pasos.map((p) => `<li>${md(p)}</li>`).join("")}</ol>
    ${a.truco ? `<p class="consejo">💡 ${md(a.truco)}</p>` : ""}
  </details>`;
};
function pintarAyuda(k) {
  app.innerHTML = `${cabecera("Cómo funciona", "atras")}
    <p class="intro">Toca cada apartado para ver qué es y cómo se usa. En cada pantalla tienes también un botón <b>?</b> arriba a la derecha que te trae justo a su explicación.</p>
    ${GRUPOS_AYUDA.map(([g, ks]) => `<h2 class="titulo-sec">${g}</h2>${ks.map((x) => htmlAyuda(x, x === k || (!k && x === "metodo"))).join("")}`).join("")}
    <a class="btn sec ancho" href="#/guia">Ver otra vez la bienvenida</a>`;
  if (k && AYUDA[k]) setTimeout(() => $(`#ay-${k}`)?.scrollIntoView({ block: "start" }), 60);
}

// ---------- Guía de bienvenida ----------
const GUIA = [
  ["👋", "¡Bienvenida a Repasa!", "Es como tener un profe particular en el móvil. Haces fotos a tus apuntes y te lo preparo todo para que te lo sepas y apruebes."],
  ["📸", "1. Haz fotos", "Pulsa «Nuevo tema» y haz una foto a cada página (recta y con luz). Dime si es para un examen, un test o una presentación. En 1-3 minutos está listo: mientras, no cierres la app."],
  ["🪜", "2. Sigue los 3 pasos", "Cada tema tiene 3 pasos: Entiéndelo (resumen, esquema) → Apréndetelo (tarjetas, test) → Ponte a prueba (preguntas con nota, simulacro). Si no sabes qué hacer, pulsa «Te toca ahora»."],
  ["🔥", "3. Un poquito cada día", "Haz el «Repaso de hoy»: son 10 minutos y así no se te olvida nada. Usa «🎯 Concentrarme» para estudiar sin distracciones. Cada día que estudias suma a tu racha 🔥."],
  ["❓", "Si te pierdes", "Arriba a la derecha de cada pantalla tienes un botón «?» que te explica esa parte paso a paso. Y en el inicio, el «?» abre la guía completa. Apunta cada examen en cuanto te lo digan y te aviso con tiempo. Guarda tus libros en «Mis libros» y luego solo eliges las páginas. Para inglés o francés, «Traducir con fotos». Y si algo te choca, compruébalo en el libro: la IA también se puede equivocar."],
];
function pintarGuia(n) {
  const [icono, titulo, texto] = GUIA[n], ultima = n === GUIA.length - 1;
  app.innerHTML = `<div class="guia">
    <div class="guia-emoji">${icono}</div><h1>${titulo}</h1><p>${texto}</p>
    <div class="puntos">${GUIA.map((_, i) => `<span class="${i === n ? "activo" : ""}"></span>`).join("")}</div>
    <a class="btn enorme" href="${ultima ? "#/" : `#/guia/${n + 1}`}"${ultima ? ' data-a="fin-guia"' : ""}>${ultima ? "¡Empezar!" : "Siguiente"}</a>
    ${ultima ? "" : `<a class="enlace-pie" href="#/" data-a="fin-guia">Saltar</a>`}
  </div>`;
}

// ---------- Logros ----------
function pintarLogros() {
  const tengo = leerJSON("repasa:logros", []), s = leerJSON("repasa:stats", {}), r = racha();
  app.innerHTML = `${cabecera("Mis logros", "#/", ayudaBtn("racha"))}
    <div class="caja destacada centro"><div class="emoji">🔥</div><h2>${r} día${r === 1 ? "" : "s"} seguido${r === 1 ? "" : "s"}</h2><p class="peq">Cuenta cada día que repasas tarjetas, haces un test o te corrijo algo. ¡No la rompas!</p></div>
    <div class="logros">${LOGROS.map((l) => `<div class="logro ${tengo.includes(l.id) ? "" : "bloqueado"}"><span class="emoji">${l.icono}</span><b>${l.nombre}</b><small>${l.desc}</small></div>`).join("")}</div>
    <div class="caja"><div class="etq">Tus números</div><p>📸 ${s.temas || 0} temas · 🃏 ${s.tarjetas || 0} tarjetas · ✅ ${s.tests || 0} tests · ✍️ ${s.correcciones || 0} correcciones · ⏱️ ${s.simulacros || 0} simulacros · 🎙️ ${s.orales || 0} orales · 🎯 ${s.concentracion || 0} bloques de concentración</p></div>`;
}

// ---------- Ajustes ----------
function aplicarColor() {
  const c = ls.get("repasa:color");
  if (c && c !== "violeta") document.documentElement.dataset.color = c;
  else delete document.documentElement.dataset.color;
}
let zonaAbierta = false;
async function hashPin(pin) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("repasa:" + pin));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function pintarAjustes() {
  const color = ls.get("repasa:color") || "violeta", emoji = ls.get("repasa:emoji") || "";
  const ultima = ls.get("repasa:ultimaCopia"), logros = leerJSON("repasa:logros", []).length;
  const abierta = !ls.get("repasa:pin") || zonaAbierta;
  app.innerHTML = `${cabecera("Ajustes", "#/", ayudaBtn("ajustes"))}
    <form class="caja" data-f="perfil">
      <label class="etq" for="aj-nombre">Tu nombre</label>
      <input id="aj-nombre" value="${esc(ls.get("repasa:nombre") || "")}" placeholder="Tu nombre">
      <label class="etq" for="aj-gustos">Lo que te gusta <span class="opc">(para ponerte ejemplos de eso)</span></label>
      <input id="aj-gustos" value="${esc(ls.get("repasa:gustos") || "")}" placeholder="Ej.: fútbol, Taylor Swift, dibujar, series…">
      <div class="etq">Tu emoji</div>
      <div class="emojis">${EMOJIS.map((e) => `<button type="button" class="emoji-op ${e === emoji ? "activa" : ""}" data-a="emoji" data-e="${e}">${e}</button>`).join("")}</div>
      <div class="etq">Color de la app</div>
      <div class="colores">${Object.entries(COLORES).map(([k, v]) => `<button type="button" class="color-op ${k === color ? "activa" : ""}" style="background:${v}" data-a="color" data-c="${k}" aria-label="${k}"></button>`).join("")}</div>
      <button class="btn ancho" type="submit">Guardar</button>
    </form>
    <a class="caja enlace" href="#/ayuda"><span class="emoji">❓</span><span><b>Cómo funciona la app</b><small>Cada apartado explicado paso a paso</small></span><span class="flecha">›</span></a>
    <a class="caja enlace" href="#/logros"><span class="emoji">🏅</span><span><b>Mis logros</b><small>${logros} de ${LOGROS.length} conseguidos · racha de ${racha()} días</small></span><span class="flecha">›</span></a>
    <div class="caja"><div class="etq">Recordatorio para estudiar</div>
      <p class="peq">Te pongo un aviso diario en el Calendario del móvil para que no se te olvide repasar.</p>
      <div class="fila"><input type="time" id="hora-diaria" value="${esc(ls.get("repasa:horaEstudio") || "17:30")}"><button class="btn sec" data-a="calendario-diario">📅 Añadir</button></div></div>
    <div class="caja"><div class="etq">Copia de seguridad</div>
      <p class="peq">Guarda todos tus temas en un archivo (por ejemplo, en iCloud Drive) para no perderlos si cambias de móvil o se borra Safari. ${ultima ? `Última copia: ${esc(fechaBonita(ultima))}.` : "Aún no has hecho ninguna."}</p>
      <div class="fila"><button class="btn sec" data-a="exportar">💾 Hacer copia</button><label class="btn sec" for="importar">📂 Recuperar copia</label></div>
      <input type="file" id="importar" accept=".json,application/json" hidden></div>
    <h2 class="titulo-sec">🔒 Zona de Eduardo</h2>
    ${abierta ? zonaEduardo() : `<form class="caja" data-f="pin"><p class="peq">Esta parte es solo para Eduardo.</p><div class="fila"><input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN"><button class="btn" type="submit">Entrar</button></div></form>`}
    <div class="caja suave"><div class="etq">Privacidad</div>
      <p class="peq">Tus temas y fotos se guardan en este móvil. Las fotos solo se envían a la IA (Anthropic) para preparar tu material. Si borras los datos de Safari, se borran los temas (por eso existe la copia de seguridad).</p></div>`;
}

function zonaEduardo() {
  const g = IA.gasto(), dinero = (n) => (n || 0).toFixed(2).replace(".", ",") + " $";
  return `<form class="caja" data-f="eduardo">
      <label class="etq" for="aj-clave">Clave de la IA (Claude)</label>
      <input id="aj-clave" type="password" autocomplete="off" value="${esc(IA.clave())}" placeholder="sk-ant-…">
      <label class="etq" for="aj-mensaje">💌 Mensaje para ella <span class="opc">(sale en su pantalla de inicio)</span></label>
      <textarea id="aj-mensaje" rows="2" placeholder="Ej.: ¡Mucho ánimo con el examen de mates! Confío en ti 💪">${esc(ls.get("repasa:mensaje") || "")}</textarea>
      <label class="etq" for="aj-recarga">¿Has recargado saldo? Apunta cuánto ($) <span class="opc">(${IA.saldoRestante() != null ? `ahora quedan unos ${Math.max(0, IA.saldoRestante()).toFixed(2).replace(".", ",")} $` : "así le aviso cuando queden menos de 2 $"})</span></label>
      <input id="aj-recarga" type="number" min="0" step="1" inputmode="decimal" placeholder="Ej.: 20">
      <label class="etq" for="aj-limite-dia">Temas nuevos al día como máximo <span class="opc">(0 = sin límite)</span></label>
      <input id="aj-limite-dia" type="number" min="0" inputmode="numeric" value="${esc(ls.get("repasa:limiteDia") ?? 0)}">
      <label class="etq" for="aj-limite-mes">Gasto máximo al mes en $ <span class="opc">(0 = sin límite)</span></label>
      <input id="aj-limite-mes" type="number" min="0" step="1" inputmode="decimal" value="${esc(IA.limiteMes())}">
      <label class="etq" for="aj-pin">${ls.get("repasa:pin") ? "Cambiar el PIN" : "Poner un PIN"} <span class="opc">(${ls.get("repasa:pin") ? "vacío = se queda igual" : "para que solo entres tú"})</span></label>
      <input id="aj-pin" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Mínimo 4 números">
      <div class="fila"><button class="btn" type="submit">Guardar</button><button class="btn sec" type="button" data-a="probar-clave">Probar la clave</button></div>
    </form>
    <div class="caja">
      <div class="etq">Gasto de la IA</div>
      <p>Este mes: <b>${dinero(g.mes === new Date().toISOString().slice(0, 7) ? g.mesTotal : 0)}</b>${IA.limiteMes() ? ` de ${dinero(IA.limiteMes())}` : ""} · Desde el principio: ${dinero(g.total)}</p>
      <p class="peq">Aproximado, según la tarifa oficial. El dato exacto está en console.anthropic.com.</p>
    </div>
    <div class="caja">
      <div class="etq">Instalar en otro móvil</div>
      <p class="peq">Copia un enlace que ya lleva la clave puesta. Mándalo solo por privado: quien lo tenga puede usar la IA con tu cuenta.</p>
      <button class="btn sec" data-a="enlace-clave" ${IA.tieneClave() ? "" : "disabled"}>🔗 Copiar enlace con la clave</button>
    </div>`;
}

// ---------- Eventos ----------
const ACCIONES = {
  "editar-libro": async () => {
    const l = libroVisible, t = prompt("Nombre del libro:", l.titulo);
    if (t === null) return;
    const a = prompt("Asignatura:", l.asignatura || "");
    Object.assign(l, { titulo: t.trim() || l.titulo, asignatura: (a ?? l.asignatura).trim() });
    await Almacen.libros.guardar(l);
    pintar();
  },
  "pagina-libro": async (b) => {
    const l = libroVisible, p = l.paginas[+b.dataset.i];
    const v = prompt("Número de página (déjalo vacío para borrar esta foto):", p.num || "");
    if (v === null) return;
    if (!v.trim()) {
      if (!confirm("¿Borrar esta foto del libro?")) return;
      l.paginas.splice(+b.dataset.i, 1);
    } else {
      const n = parseInt(v, 10);
      if (!n) return aviso("Escribe solo el número");
      const otra = l.paginas.findIndex((x, i) => x.num === n && i !== +b.dataset.i);
      if (otra >= 0 && !confirm(`Ya tienes la página ${n}. ¿Cambio la vieja por esta?`)) return;
      p.num = n;
      p.doble = false;
      if (otra >= 0) l.paginas.splice(otra, 1);
    }
    await Almacen.libros.guardar(l);
    pintar();
  },
  "borrar-libro": async () => {
    if (!confirm("¿Borrar este libro y todas sus páginas? Los temas que ya creaste no se borran.")) return;
    await Almacen.libros.borrar(libroVisible.id);
    ir("#/libros");
  },
  "tema-de-libro": temaDeLibro,
  foco: (b) => empezarFoco(+b.dataset.e, +b.dataset.d),
  "foco-pausa": () => {
    if (foco.restante != null) (foco.fin = Date.now() + foco.restante), (foco.restante = null);
    else foco.restante = Math.max(0, foco.fin - Date.now());
    pintarConcentrar();
  },
  "foco-fin": () => {
    if (!confirm("¿Terminar la sesión de concentración?")) return;
    clearInterval(foco.reloj);
    foco.bloqueo?.release?.().catch(() => {});
    aviso(foco.bloques ? `¡Buen trabajo! ${foco.bloques} bloque${foco.bloques === 1 ? "" : "s"} hoy 💪` : "Sesión terminada");
    foco = null;
    pintarConcentrar();
  },
  "soltar-examen": () => { Object.assign(borrador, { examenId: null, para: "" }); pintarNuevo(borrador.traducir); },
  "borrar-examen": (b) => {
    if (!confirm("¿Quitar este examen de la lista?")) return;
    ls.set("repasa:examenes", JSON.stringify(leerJSON("repasa:examenes", []).filter((x) => x.id !== b.dataset.id)));
    pintar();
  },
  "avisar-saldo": async (b) => {
    const texto = b.dataset.que === "acabado" ? "Eduardo, se ha acabado el saldo de Repasa. ¿Me lo recargas? 🙏" : "Eduardo, queda poco saldo en Repasa. ¿Me lo recargas cuando puedas? 🙏";
    try {
      if (navigator.share) return await navigator.share({ text: texto });
    } catch (e) {
      if (e.name === "AbortError") return;
    }
    location.href = "https://wa.me/?text=" + encodeURIComponent(texto);
  },
  volver: () => (history.length > 1 ? history.back() : ir("#/")),
  "fin-guia": () => { ls.set("repasa:guiaVista", "1"); ir("#/"); },
  "cerrar-instalar": () => { ls.set("repasa:sinInstalar", "1"); pintar(); },
  objetivo: (b) => { borrador.objetivo = b.dataset.k; guardarCamposBorrador(); pintarNuevo(false); },
  "quitar-foto": (b) => { borrador.fotos.splice(+b.dataset.i, 1); guardarCamposBorrador(); pintarNuevo(borrador.traducir); },
  "mover-foto": (b) => { const i = +b.dataset.i, f = borrador.fotos; [f[i - 1], f[i]] = [f[i], f[i - 1]]; guardarCamposBorrador(); pintarNuevo(borrador.traducir); },
  crear,
  reintentar: () => (trabajando ? aviso("Espera a que termine el tema que se está preparando") : generar(temaVisible)),
  "borrar-tema": async () => {
    if (!confirm("¿Seguro que quieres borrar este tema? No se puede deshacer.")) return;
    await Almacen.borrar(temaVisible.id);
    aviso("Tema borrado");
    ir("#/");
  },
  pestana: (b) => ir(`#/tema/${temaVisible.id}/${b.dataset.p}`),
  facil: async (b) => {
    const t = temaVisible, i = +b.dataset.i;
    b.disabled = true;
    b.textContent = "Pensando…";
    try {
      const { texto, coste } = await IA.explicar(t, t.resumen.apartados[i]);
      (t.facil ||= {})[i] = texto;
      t.coste = (t.coste || 0) + coste;
      await Almacen.guardar(t);
      $(`#facil-${i}`).innerHTML = `<div class="etq">Más fácil</div>${mdBloque(texto)}`;
      b.remove();
    } catch (e) {
      aviso(IA.traducirError(e));
      b.disabled = false;
      b.textContent = "💡 Explícamelo más fácil";
    }
  },
  imprimir: () => window.print(),
  "copiar-traduccion": async () => {
    const texto = temaVisible.resumen.traduccion.map((p) => `${p.pagina}\n${p.texto.replace(/\*\*/g, "")}`).join("\n\n");
    try { await navigator.clipboard.writeText(texto); aviso("Traducción copiada"); } catch { aviso("No se ha podido copiar"); }
  },
  "ocultar-conceptos": (b) => { ls.set("repasa:ocultarConceptos", b.checked ? "1" : "0"); document.querySelectorAll(".concepto").forEach((d) => (d.open = !b.checked)); },
  "empezar-tarjetas": (b) => {
    const t = temaVisible;
    const cola = b.dataset.todas === "1" ? t.resumen.tarjetas.map((_, i) => ({ t, i })) : tarjetasPendientes(t);
    empezarSesion($("#zona"), cola);
  },
  girar: () => { if (!sesion.girada) { sesion.girada = true; pintarCarta(); } },
  carta: (b) => responderCarta(+b.dataset.n),
  "fin-tarjetas": () => (temaVisible ? PANELES.tarjetas($("#zona"), temaVisible) : ir("#/")),
  "empezar-test": (b) => empezarTest(b.dataset.falladas === "1"),
  opcion: (b) => {
    const T = test, { i } = T.preguntas[T.pos], k = +b.dataset.k;
    T.elegida = k;
    if (k === T.t.resumen.test[i].correcta) T.aciertos++;
    else T.falladas.push(i);
    pintarPregunta();
  },
  "siguiente-test": () => { test.pos++; test.elegida = null; pintarPregunta(); window.scrollTo(0, 0); },
  corregir: (b) => corregir(b, +b.dataset.i),
  "ver-modelo": (b) => { const m = $(`#mod-${b.dataset.i}`); m.classList.toggle("oculto"); b.textContent = m.classList.contains("oculto") ? "Ver la respuesta de 10" : "Ocultar la respuesta"; },
  ensayo: abrirEnsayo,
  "cerrar-ensayo": () => $(".ensayo")?.remove(),
  sugerencia: (b) => enviarDuda(b.textContent),
  "poner-fecha": async () => {
    const f = $("#fecha-plan").value;
    if (!f) return aviso("Elige la fecha");
    Object.assign(temaVisible, { fechaExamen: f, planInicio: hoyISO() });
    temaVisible.progreso.plan = {};
    await Almacen.guardar(temaVisible);
    pintar();
  },
  "cambiar-fecha": async () => {
    temaVisible.fechaExamen = "";
    await Almacen.guardar(temaVisible);
    pintar();
  },
  paso: async (b) => { temaVisible.progreso.plan[b.dataset.k] = b.checked; await Almacen.guardar(temaVisible); },
  "ver-foto": (b) => {
    const d = document.createElement("div");
    d.className = "visor";
    d.dataset.a = "cerrar-visor";
    d.innerHTML = `<img src="${verFoto(temaVisible.fotos[+b.dataset.i])}" alt="">`;
    document.body.append(d);
  },
  "cerrar-visor": (b) => b.remove(),
  "probar-clave": async (b) => {
    IA.ponerClave($("#aj-clave").value);
    b.disabled = true;
    try { await IA.probarClave(); aviso("La clave funciona ✅"); } catch (e) { aviso(IA.traducirError(e)); }
    b.disabled = false;
  },
  escuchar,
  "empezar-simulacro": (b) => empezarSimulacro(b.dataset.modo),
  "simu-op": (b) => {
    const n = +b.dataset.n, k = +b.dataset.k;
    simu.test[n].elegida = k;
    document.querySelectorAll(`[data-a="simu-op"][data-n="${n}"]`).forEach((x) => x.classList.toggle("marcada", +x.dataset.k === k));
  },
  "entregar-simulacro": () => {
    const blancas = simu.test.filter((x) => x.elegida == null).length + simu.escritas.filter((x) => !x.respuesta.trim()).length;
    if (Date.now() < simu.fin && !confirm(blancas ? `Te quedan ${blancas} preguntas sin contestar. ¿Entregas ya?` : "¿Entregas el examen?")) return;
    entregarSimulacro();
  },
  "quitar-cor": (b) => { fotosCorregir.splice(+b.dataset.i, 1); enunciadoCorregir = $("#cor-enunciado").value; $("#corrector").innerHTML = htmlCorrector(); },
  "corregir-foto": corregirFotoAccion,
  "corregir-este": (b) => {
    enunciadoCorregir = temaVisible.practica[+b.dataset.i].enunciado.replace(/\*\*/g, "");
    $("#corrector").innerHTML = htmlCorrector();
    $("#corrector").scrollIntoView({ behavior: "smooth", block: "center" });
    aviso("Ahora haz la foto de tu solución 📷");
  },
  ejercicios: async (b) => {
    const t = temaVisible;
    b.disabled = true;
    b.textContent = "Creando ejercicios…";
    try {
      const { datos, coste } = await IA.ejerciciosParecidos(t, t.practica.map((e) => e.enunciado));
      t.practica.push(...datos.ejercicios);
      t.coste = (t.coste || 0) + coste;
      await Almacen.guardar(t);
      actividad();
      await pintar();
      document.querySelectorAll(".ejercicio")[t.practica.length - datos.ejercicios.length]?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      aviso(IA.traducirError(e));
      b.disabled = false;
      b.textContent = "Ponme 5 ejercicios";
    }
  },
  grabar,
  "corregir-oral": corregirOralAccion,
  "calendario-plan": () => {
    const t = temaVisible, hora = $("#hora-plan").value || "17:30", nombre = t.resumen.titulo.replace(/\*\*/g, "");
    ls.set("repasa:horaEstudio", hora);
    const eventos = planDias(t).filter((d) => d.fecha >= hoyISO()).map((d) => ({ fecha: d.fecha, hora, minutos: 45, titulo: `📚 ${nombre}`, desc: d.pasos.map((p) => "• " + p.texto).join("\n") + "\n\nÁbrelo en Repasa." }));
    eventos.push({ fecha: t.fechaExamen, todoElDia: true, titulo: `✍️ Examen: ${nombre}`, desc: "¡Mucha suerte! Lo llevas preparado." });
    calendario(eventos);
  },
  "calendario-diario": () => {
    const hora = $("#hora-diaria").value || "17:30";
    ls.set("repasa:horaEstudio", hora);
    calendario([{ fecha: hoyISO(), hora, minutos: 20, diario: true, titulo: "🧠 Repaso de hoy en Repasa", desc: "Abre Repasa y haz tus tarjetas de hoy. Son 10 minutos y no se te olvida nada." }]);
  },
  exportar: exportarCopia,
  emoji: (b) => { ls.set("repasa:emoji", b.dataset.e); document.querySelectorAll(".emoji-op").forEach((x) => x.classList.toggle("activa", x === b)); },
  color: (b) => { ls.set("repasa:color", b.dataset.c); aplicarColor(); document.querySelectorAll(".color-op").forEach((x) => x.classList.toggle("activa", x === b)); },
  "objetivo-comb": (b) => { combinacion.fecha = $("#fecha").value; combinacion.notas = $("#notas").value; combinacion.objetivo = b.dataset.k; pintar(); },
  "crear-combinado": async () => {
    const c = combinacion;
    c.fecha = $("#fecha").value;
    c.notas = $("#notas").value.trim();
    if (c.ids.length < 2) return aviso("Elige al menos 2 temas");
    if (!(await puedoCrearTema())) return;
    const primero = await Almacen.leer(c.ids[0]);
    const t = { id: nuevoId(), creado: Date.now(), fotos: [], origen: [...c.ids], objetivo: c.objetivo, idioma: primero?.idioma || "Español", fechaExamen: c.fecha, planInicio: hoyISO(), notas: c.notas, resumen: null, progreso: progresoVacio(), chat: [], coste: 0 };
    await Almacen.guardar(t);
    combinacion = null;
    generar(t);
  },
  "enlace-clave": async () => {
    const enlace = `${location.origin}${location.pathname}#clave=${encodeURIComponent(IA.clave())}`;
    try { await navigator.clipboard.writeText(enlace); aviso("Enlace copiado. Mándaselo por privado"); } catch { prompt("Copia este enlace:", enlace); }
  },
};

function guardarCamposBorrador() {
  if (!borrador) return;
  if ($("#fecha")) borrador.fecha = $("#fecha").value;
  if ($("#notas")) borrador.notas = $("#notas").value;
  if ($("#idioma")) borrador.idioma = leerIdioma();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (!b || b.disabled) return;
  if (b.type === "checkbox") return; // los checkbox van por «change»
  e.preventDefault();
  ACCIONES[b.dataset.a]?.(b, e);
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.matches("[data-fotos]")) return añadirFotos(el);
  if (el.id === "importar") return importarCopia(el);
  if (el.dataset.comb) {
    const ids = combinacion.ids;
    if (el.checked && !ids.includes(el.dataset.comb)) ids.push(el.dataset.comb);
    if (!el.checked) ids.splice(ids.indexOf(el.dataset.comb), 1);
    return;
  }
  if (el.type === "checkbox" && el.dataset.a) return ACCIONES[el.dataset.a]?.(el, e);
  if (el.matches("[data-idioma]")) $(`#${el.id}-otro`)?.classList.toggle("oculto", el.value !== "__otro");
  if (el.dataset.resp != null && temaVisible) {
    const p = temaVisible.progreso.preguntas;
    p[el.dataset.resp] = { ...p[el.dataset.resp], respuesta: el.value };
    Almacen.guardar(temaVisible);
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.dataset.f;
  if (f === "examen") {
    const e = { id: nuevoId(), asignatura: $("#ex-asig").value.trim(), fecha: $("#ex-fecha").value, que: $("#ex-que").value.trim() };
    if (!e.asignatura || !e.fecha) return aviso("Pon la asignatura y la fecha");
    ls.set("repasa:examenes", JSON.stringify([...leerJSON("repasa:examenes", []), e]));
    aviso(`Apuntado: ${e.asignatura}, ${fechaBonita(e.fecha)}`);
    return pintar();
  }
  if (f === "nombre") {
    const n = $("#nom").value.trim();
    if (n) ls.set("repasa:nombre", n);
    pintar();
  } else if (f === "chat") enviarDuda($("#msg").value);
  else if (f === "perfil") {
    ls.set("repasa:nombre", $("#aj-nombre").value.trim());
    ls.set("repasa:gustos", $("#aj-gustos").value.trim());
    aviso("Guardado");
    ir("#/");
  } else if (f === "pin") {
    if ((await hashPin($("#pin").value)) === ls.get("repasa:pin")) (zonaAbierta = true), pintar();
    else aviso("PIN incorrecto");
  } else if (f === "eduardo") {
    IA.ponerClave($("#aj-clave").value);
    ls.set("repasa:mensaje", $("#aj-mensaje").value.trim());
    const recarga = parseFloat($("#aj-recarga").value);
    if (recarga > 0) {
      // Lo que quedaba (si sabíamos) + lo que acaba de meter
      IA.apuntarRecarga(Math.max(0, IA.saldoRestante() ?? 0) + recarga);
      ls.set("repasa:sinSaldo", "");
    }
    ls.set("repasa:limiteDia", String(Math.max(0, parseInt($("#aj-limite-dia").value, 10) || 0)));
    ls.set("repasa:limiteMes", String(Math.max(0, parseFloat($("#aj-limite-mes").value) || 0)));
    const pin = $("#aj-pin").value.trim();
    if (pin && !/^\d{4,}$/.test(pin)) return aviso("El PIN tiene que ser de 4 números o más");
    if (pin) ls.set("repasa:pin", await hashPin(pin)), (zonaAbierta = true);
    aviso("Guardado ✅");
    pintar();
  }
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.simu != null && simu) simu.escritas[+el.dataset.simu].respuesta = el.value;
  if (el.id === "cor-enunciado") enunciadoCorregir = el.value;
});
// Enviar la duda con Intro (Mayús+Intro hace salto de línea)
document.addEventListener("keydown", (e) => {
  if (e.target.id === "msg" && e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarDuda(e.target.value);
  }
});

// ---------- Arranque ----------
(function arrancar() {
  // Enlace de instalación con la clave: se guarda y se quita de la dirección
  const m = location.hash.match(/clave=([^&]+)/);
  if (m) {
    IA.ponerClave(decodeURIComponent(m[1]));
    history.replaceState(null, "", location.pathname + "#/");
    setTimeout(() => aviso("Clave guardada ✅"), 300);
  }
  aplicarColor();
  if (!ls.get("repasa:guiaVista") && !location.hash.startsWith("#/guia")) history.replaceState(null, "", location.pathname + "#/guia");
  navigator.storage?.persist?.().catch(() => {});
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  pintar();
})();
