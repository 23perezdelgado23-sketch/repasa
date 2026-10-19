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
  `<header class="cab">${atras ? `<a class="atras" href="${atras}" aria-label="Volver">‹</a>` : ""}<h1>${esc(titulo)}</h1>${extra}</header>`;

// ---------- Progreso ----------
const progresoVacio = () => ({ test: null, preguntas: {}, tarjetas: {}, plan: {} });
const esPendiente = (p) => !p || p.proxima <= hoyISO();
const tarjetasPendientes = (t) => (t.resumen ? t.resumen.tarjetas.map((c, i) => ({ t, i })).filter(({ i }) => esPendiente(t.progreso.tarjetas[i])) : []);
function dominio(t) {
  if (!t.resumen) return 0;
  const p = t.progreso, r = t.resumen, partes = [];
  if (p.test?.intentos) partes.push(p.test.mejor);
  const notas = Object.values(p.preguntas).map((x) => x.nota).filter((n) => n != null);
  if (notas.length && r.preguntas_examen.length) partes.push((notas.reduce((a, b) => a + b, 0) / r.preguntas_examen.length) * 10);
  if (r.tarjetas.length && Object.keys(p.tarjetas).length) partes.push((Object.values(p.tarjetas).filter((x) => x.caja >= 3).length / r.tarjetas.length) * 100);
  return partes.length ? Math.round(partes.reduce((a, b) => a + b, 0) / partes.length) : 0;
}
const barra = (pct) => `<div class="barra"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;

// ---------- Navegación ----------
async function pintar() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const [ruta, a, b] = location.hash.replace(/^#\/?/, "").split("/");
  try {
    if (ruta === "nuevo") return pintarNuevo(a === "traducir");
    if (ruta === "tema") return await pintarTema(a, b);
    if (ruta === "repaso") return await pintarRepaso();
    if (ruta === "ajustes") return pintarAjustes();
    return await pintarInicio();
  } catch (e) {
    app.innerHTML = cabecera("Algo ha fallado") + `<div class="caja aviso">${esc(e.message || e)}</div><a class="btn" href="#/">Volver al inicio</a>`;
  }
}
const ir = (h) => (location.hash === h ? pintar() : (location.hash = h));
window.addEventListener("hashchange", () => { pintar(); window.scrollTo(0, 0); });

// ---------- Inicio ----------
async function pintarInicio() {
  const temas = (await Almacen.todos()).sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0));
  const nombre = ls.get("repasa:nombre");
  const pendientes = temas.reduce((n, t) => n + tarjetasPendientes(t).length, 0);
  const proximos = temas.filter((t) => t.fechaExamen && diasHasta(t.fechaExamen) >= 0).sort((a, b) => a.fechaExamen.localeCompare(b.fechaExamen));
  const instalada = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  const grupos = {};
  for (const t of temas) (grupos[t.resumen?.asignatura || (trabajando?.id === t.id ? "Preparándose…" : "Sin terminar")] ||= []).push(t);

  app.innerHTML = `
    <header class="cab inicio"><div><div class="hola">${nombre ? `Hola, ${esc(nombre)} 👋` : "Hola 👋"}</div><h1>Repasa</h1></div><a class="icono-btn" href="#/ajustes" aria-label="Ajustes">⚙️</a></header>
    ${!IA.tieneClave() ? `<a class="caja aviso enlace" href="#/ajustes"><b>Falta un paso:</b> poner la clave de la IA en Ajustes (lo hace Eduardo una vez).</a>` : ""}
    ${!nombre ? `<form class="caja" data-f="nombre"><label class="etq" for="nom">¿Cómo te llamas?</label><div class="fila"><input id="nom" autocomplete="given-name" placeholder="Tu nombre"><button class="btn" type="submit">Guardar</button></div></form>` : ""}
    ${!instalada && !ls.get("repasa:sinInstalar") ? `<div class="caja suave"><b>Ponla como una app:</b> en Safari toca <b>Compartir</b> (el cuadrado con la flecha) → <b>Añadir a pantalla de inicio</b>. <button class="enlace-btn" data-a="cerrar-instalar">Vale</button></div>` : ""}
    <div class="acciones">
      <a class="grande-btn principal" href="#/nuevo"><span class="emoji">📸</span><span><b>Nuevo tema</b><small>Fotos de tu libro o apuntes → todo listo para estudiar</small></span></a>
      <a class="grande-btn" href="#/nuevo/traducir"><span class="emoji">🌍</span><span><b>Traducir con fotos</b><small>Inglés, francés o lo que sea → traducido y resumido</small></span></a>
    </div>
    ${pendientes ? `<a class="caja repaso enlace" href="#/repaso"><span class="emoji">🧠</span><span><b>Repaso de hoy</b><small>${pendientes} tarjeta${pendientes === 1 ? "" : "s"} para no olvidar lo que ya sabes</small></span><span class="flecha">›</span></a>` : ""}
    ${proximos.length ? `<h2 class="titulo-sec">Próximos exámenes</h2>${proximos.map((t) => `<a class="caja fila-tema enlace" href="#/tema/${t.id}/plan"><span class="cuando ${diasHasta(t.fechaExamen) <= 2 ? "urgente" : ""}">${cuandoEs(t.fechaExamen)}</span><span class="nombre-tema">${esc(t.resumen?.titulo || "Tema")}<small>${esc(t.resumen?.asignatura || "")}</small></span><span class="flecha">›</span></a>`).join("")}` : ""}
    ${Object.entries(grupos).map(([asig, ts]) => `<h2 class="titulo-sec">${esc(asig)}</h2>${ts.map((t) => `
      <a class="caja fila-tema enlace" href="#/tema/${t.id}">
        <span class="nombre-tema">${t.objetivo === "traducir" ? "🌍 " : ""}${esc(t.resumen?.titulo || `${t.fotos.length} foto${t.fotos.length === 1 ? "" : "s"}`)}<small>${t.resumen ? `Lo dominas al ${dominio(t)}%` : trabajando?.id === t.id ? "La IA está con ello…" : "No se terminó: toca para reintentar"}</small>${t.resumen ? barra(dominio(t)) : ""}</span><span class="flecha">›</span>
      </a>`).join("")}`).join("")}
    ${!temas.length ? `<div class="vacio"><p>Aún no tienes temas.</p><p>Haz fotos a las páginas que entran y te preparo el resumen, el esquema, un test, tarjetas para memorizar y las preguntas que pueden caer, con corrección.</p></div>` : ""}`;
}

// ---------- Nuevo tema ----------
function selectorIdioma(id, valor, texto) {
  const otro = valor && !IDIOMAS.includes(valor);
  return `<label class="etq" for="${id}">${texto}</label>
    <select id="${id}" data-idioma>${IDIOMAS.map((l) => `<option ${l === valor ? "selected" : ""}>${l}</option>`).join("")}<option value="__otro" ${otro ? "selected" : ""}>Otro…</option></select>
    <input id="${id}-otro" class="${otro ? "" : "oculto"}" placeholder="Escribe el idioma" value="${otro ? esc(valor) : ""}">`;
}

function pintarNuevo(traducir) {
  if (!borrador || borrador.traducir !== traducir) borrador = { traducir, fotos: [], objetivo: traducir ? "traducir" : "examen", idioma: "Español", fecha: "", notas: "" };
  const b = borrador;
  app.innerHTML = `
    ${cabecera(traducir ? "Traducir con fotos" : "Nuevo tema")}
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
      <label class="etq" for="fecha">${traducir ? "3." : "3."} ¿Cuándo es el examen o la entrega? <span class="opc">(opcional)</span></label>
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
async function comprimir(file) {
  let img = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!img)
    img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se ha podido abrir una de las fotos"));
      i.src = URL.createObjectURL(file);
    });
  const f = Math.min(1, 2000 / Math.max(img.width, img.height));
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
  const destino = input.dataset.fotos === "tema" ? temaVisible.fotos : borrador.fotos;
  const sitio = MAX_FOTOS - destino.length;
  if (sitio <= 0) return aviso(`Como mucho ${MAX_FOTOS} fotos por tema`);
  if (archivos.length > sitio) aviso(`Solo caben ${sitio} fotos más`);
  const z = $("#cargando-fotos");
  if (z) z.innerHTML = `<p class="peq">Preparando fotos…</p>`;
  const nuevas = [];
  for (const f of archivos.slice(0, sitio)) {
    try { nuevas.push(await comprimir(f)); } catch (e) { aviso(e.message); }
  }
  if (input.dataset.fotos === "tema") {
    if (!nuevas.length) return;
    if (!confirm(`¿Añado ${nuevas.length} página${nuevas.length === 1 ? "" : "s"} y rehago el material con todas? Se reinicia tu progreso de este tema.`)) return;
    temaVisible.fotos.push(...nuevas);
    generar(temaVisible);
  } else {
    borrador.fotos.push(...nuevas);
    pintarNuevo(borrador.traducir);
  }
}

async function crear() {
  if (!IA.tieneClave()) return aviso("Primero hay que poner la clave en Ajustes");
  const b = borrador;
  b.idioma = leerIdioma();
  b.fecha = $("#fecha").value;
  b.notas = $("#notas").value.trim();
  const t = {
    id: nuevoId(), creado: Date.now(), fotos: b.fotos, objetivo: b.objetivo, idioma: b.idioma, fechaExamen: b.fecha, planInicio: hoyISO(),
    notas: b.notas, resumen: null, progreso: progresoVacio(), chat: [], coste: 0,
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
    const fotos = await Promise.all(t.fotos.map(aBase64));
    const dias = t.fechaExamen ? Math.max(0, diasHasta(t.fechaExamen)) : null;
    const { datos, coste } = await IA.hacerTema(fotos, { objetivo: t.objetivo, idioma: t.idioma, notas: t.notas, dias }, (d) => (trabajando.letras += d.length));
    Object.assign(t, { resumen: datos, error: "", progreso: progresoVacio(), chat: [], facil: {}, coste: (t.coste || 0) + coste });
    await Almacen.guardar(t);
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
  const esperado = (t.objetivo === "traducir" ? 16000 : 9000) + 3000 * t.fotos.length;
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
  const lista = [
    ...(r.traduccion.length ? [["traduccion", "Traducción"]] : []),
    ["resumen", "Resumen"], ["esquema", "Esquema"], ["conceptos", "Conceptos"], ["tarjetas", "Tarjetas"], ["test", "Test"], ["examen", "Examen"],
    ...(r.presentacion.guion.length ? [["presentacion", "Presentación"]] : []),
    ["dudas", "Dudas"], ["plan", "Plan"], ["paginas", "Páginas"],
  ];
  if (!lista.some(([k]) => k === pest)) pest = lista[0][0];
  app.innerHTML = `${cabecera(r.titulo)}
    <div class="sub-cab">${esc(r.asignatura)}${t.fechaExamen ? ` · examen ${cuandoEs(t.fechaExamen)}` : ""}${r.idioma_original && r.traduccion.length ? ` · de ${esc(r.idioma_original)} a ${esc(t.idioma)}` : ""}</div>
    <nav class="pestanas">${lista.map(([k, n]) => `<button class="${k === pest ? "activa" : ""}" data-a="pestana" data-p="${k}">${n}</button>`).join("")}</nav>
    <section id="zona"></section>`;
  $(".pestanas .activa")?.scrollIntoView({ inline: "center", block: "nearest" });
  PANELES[pest]($("#zona"), t);
}

const lista = (xs) => `<ul>${xs.map((x) => `<li>${md(x)}</li>`).join("")}</ul>`;

const PANELES = {
  traduccion(z, t) {
    const r = t.resumen;
    z.innerHTML = `
      ${r.lectura.avisos.length ? `<div class="caja aviso"><b>Ojo con tus fotos</b>${lista(r.lectura.avisos)}</div>` : ""}
      ${r.traduccion.map((p) => `<article class="caja traduccion"><div class="etq">${esc(p.pagina)}</div>${mdBloque(p.texto)}</article>`).join("")}
      <button class="btn sec" data-a="copiar-traduccion">📋 Copiar la traducción</button>
      ${r.vocabulario.length ? `<h2 class="titulo-sec">Vocabulario importante</h2><div class="caja"><dl class="vocab">${r.vocabulario.map((v) => `<dt>${esc(v.original)}</dt><dd><b>${esc(v.traduccion)}</b>${v.ejemplo ? `<small>${esc(v.ejemplo)}</small>` : ""}</dd>`).join("")}</dl></div>` : ""}`;
  },

  resumen(z, t) {
    const r = t.resumen;
    const grupos = {};
    for (const d of r.datos_clave) (grupos[d.tipo] ||= []).push(d);
    z.innerHTML = `
      ${r.lectura.avisos.length && !r.traduccion.length ? `<div class="caja aviso"><b>Ojo con tus fotos</b>${lista(r.lectura.avisos)}</div>` : ""}
      <div class="caja destacada"><div class="etq">En 30 segundos</div><p class="grande">${md(r.en_30_segundos)}</p></div>
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
          <div class="badges">${q.probabilidad === "muy_probable" ? `<span class="badge alta">Muy probable</span>` : ""}<span class="badge">${TIPO_PREGUNTA[q.tipo] || ""}</span>${h.nota != null ? `<span class="badge nota ${h.nota >= 7 ? "bien" : h.nota >= 5 ? "reg" : "mal"}">${h.nota}/10</span>` : ""}</div>
          <h3>${md(q.pregunta)}</h3>
          <textarea id="resp-${i}" data-resp="${i}" rows="4" placeholder="Tu respuesta…">${esc(h.respuesta || "")}</textarea>
          <div class="fila"><button class="btn" data-a="corregir" data-i="${i}">✨ Corregir</button><button class="btn sec" data-a="ver-modelo" data-i="${i}">Ver la respuesta de 10</button></div>
          <div id="corr-${i}">${h.correccion ? htmlCorreccion(h.correccion) : ""}</div>
          <div class="modelo oculto" id="mod-${i}"><div class="etq">Respuesta de 10</div>${mdBloque(q.respuesta_modelo)}${q.claves.length ? `<div class="etq">Lo que busca el profe</div>${lista(q.claves)}` : ""}</div>
        </article>`;
      }).join("")}`;
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
      ${dias.map((d) => `<div class="caja dia ${d.fecha === hoy ? "hoy" : d.fecha < hoy ? "pasado" : ""}">
        <div class="etq">${d.fecha === hoy ? "Hoy" : esc(fechaBonita(d.fecha))}</div>
        ${d.pasos.map(({ k, texto, ir }) => `<label class="paso"><input type="checkbox" data-a="paso" data-k="${k}" ${t.progreso.plan[k] ? "checked" : ""}><span>${esc(texto)}${ir ? ` <button class="enlace-btn" data-a="pestana" data-p="${ir}">Ir</button>` : ""}</span></label>`).join("")}
      </div>`).join("")}`;
  },

  paginas(z, t) {
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
}

async function pintarRepaso() {
  const temas = (await Almacen.todos()).filter((t) => t.resumen);
  const cola = temas.flatMap(tarjetasPendientes);
  temaVisible = null;
  app.innerHTML = `${cabecera("Repaso de hoy")}<section id="zona"></section>`;
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
  const nota = (pct / 10).toFixed(1).replace(".", ",");
  $("#zona").innerHTML = `<div class="caja centro"><div class="emoji">${pct >= 90 ? "🏆" : pct >= 70 ? "💪" : pct >= 50 ? "👍" : "📖"}</div>
    <h2>Un ${nota}</h2><p>${T.aciertos} de ${T.preguntas.length} bien. ${pct >= 90 ? "¡Te lo sabes!" : pct >= 70 ? "Muy bien, repasa las que fallaste." : "Relee el resumen de lo que has fallado y repite."}</p>
    <div class="fila centrada">${T.falladas.length ? `<button class="btn" data-a="empezar-test" data-falladas="1">Repetir las ${T.falladas.length} falladas</button>` : ""}<button class="btn sec" data-a="empezar-test">Test completo</button></div></div>`;
  test = null;
}

// ---------- Examen ----------
const htmlCorreccion = (c) => `<div class="correccion">
  <div class="nota-grande ${c.nota >= 7 ? "bien" : c.nota >= 5 ? "reg" : "mal"}">${c.nota}<small>/10</small></div>
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

// ---------- Ajustes ----------
function pintarAjustes() {
  const g = IA.gasto();
  const dinero = (n) => (n || 0).toFixed(2).replace(".", ",") + " $";
  app.innerHTML = `${cabecera("Ajustes")}
    <form class="caja" data-f="ajustes">
      <label class="etq" for="aj-nombre">Tu nombre</label>
      <input id="aj-nombre" value="${esc(ls.get("repasa:nombre") || "")}" placeholder="Tu nombre">
      <label class="etq" for="aj-clave">Clave de la IA (Claude)</label>
      <input id="aj-clave" type="password" autocomplete="off" value="${esc(IA.clave())}" placeholder="sk-ant-…">
      <p class="peq">Se guarda solo en este móvil. La pone Eduardo.</p>
      <div class="fila"><button class="btn" type="submit">Guardar</button><button class="btn sec" type="button" data-a="probar-clave">Probar la clave</button></div>
    </form>
    <div class="caja">
      <div class="etq">Gasto de la IA</div>
      <p>Este mes: <b>${dinero(g.mes === new Date().toISOString().slice(0, 7) ? g.mesTotal : 0)}</b> · Desde el principio: ${dinero(g.total)}</p>
      <p class="peq">Aproximado, según la tarifa oficial. El dato exacto está en console.anthropic.com.</p>
    </div>
    <div class="caja">
      <div class="etq">Instalar en otro móvil</div>
      <p class="peq">Copia un enlace que ya lleva la clave puesta. Mándalo solo por privado: quien lo tenga puede usar la IA con tu cuenta.</p>
      <button class="btn sec" data-a="enlace-clave" ${IA.tieneClave() ? "" : "disabled"}>🔗 Copiar enlace con la clave</button>
    </div>
    <div class="caja suave">
      <div class="etq">Privacidad</div>
      <p class="peq">Tus temas y fotos se guardan en este móvil. Las fotos solo se envían a la IA (Anthropic) para preparar tu material. Si borras la app o los datos de Safari, se borran los temas.</p>
    </div>`;
}

// ---------- Eventos ----------
const ACCIONES = {
  "cerrar-instalar": () => { ls.set("repasa:sinInstalar", "1"); pintar(); },
  objetivo: (b) => { borrador.objetivo = b.dataset.k; guardarCamposBorrador(); pintarNuevo(false); },
  "quitar-foto": (b) => { borrador.fotos.splice(+b.dataset.i, 1); guardarCamposBorrador(); pintarNuevo(borrador.traducir); },
  "mover-foto": (b) => { const i = +b.dataset.i, f = borrador.fotos; [f[i - 1], f[i]] = [f[i], f[i - 1]]; guardarCamposBorrador(); pintarNuevo(borrador.traducir); },
  crear,
  reintentar: () => generar(temaVisible),
  "borrar-tema": async () => {
    if (!confirm("¿Seguro que quieres borrar este tema? No se puede deshacer.")) return;
    await Almacen.borrar(temaVisible.id);
    aviso("Tema borrado");
    ir("#/");
  },
  pestana: (b) => { history.replaceState(null, "", `#/tema/${temaVisible.id}/${b.dataset.p}`); pintar(); window.scrollTo(0, 0); },
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
  if (f === "nombre") {
    const n = $("#nom").value.trim();
    if (n) ls.set("repasa:nombre", n);
    pintar();
  } else if (f === "chat") enviarDuda($("#msg").value);
  else if (f === "ajustes") {
    ls.set("repasa:nombre", $("#aj-nombre").value.trim());
    IA.ponerClave($("#aj-clave").value);
    aviso("Guardado");
    ir("#/");
  }
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
  navigator.storage?.persist?.().catch(() => {});
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  pintar();
})();
