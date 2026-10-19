// Todo lo que hace la IA (Claude). La clave se guarda solo en este móvil y cada consulta se paga en la cuenta de Anthropic de Eduardo.
const IA = (() => {
  const MODELO = "claude-opus-5-5";
  const PRECIO = { entrada: 4, salida: 20 }; // $ por millón de tokens (tarifa oficial de Anthropic)
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  const clave = () => ls.get("repasa:clave") || "";
  const cliente = () => {
    if (!clave()) throw new Error("Falta la clave de la IA. Ponla en Ajustes.");
    return new window.AnthropicSDK({ apiKey: clave(), dangerouslyAllowBrowser: true, maxRetries: 2 });
  };

  // Gasto aproximado (para que Eduardo lo vea en Ajustes)
  function apuntar(u) {
    const c =
      (((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) * PRECIO.entrada +
        (u.output_tokens || 0) * PRECIO.salida) / 1e6;
    const mes = new Date().toISOString().slice(0, 7);
    let g = {};
    try { g = JSON.parse(ls.get("repasa:gasto") || "{}"); } catch {}
    if (g.mes !== mes) g = { mes, mesTotal: 0, total: g.total || 0 };
    g.mesTotal += c;
    g.total += c;
    ls.set("repasa:gasto", JSON.stringify(g));
    return c;
  }
  const gasto = () => { try { return JSON.parse(ls.get("repasa:gasto") || "{}"); } catch { return {}; } };

  // Si el modelo rechaza y otro modelo continúa, solo vale el texto que viene después del último cambio
  const textoFinal = (r) => {
    const i = r.content.map((b) => b.type).lastIndexOf("fallback");
    return r.content.slice(i + 1).filter((b) => b.type === "text").map((b) => b.text).join("");
  };

  // Límite de gasto mensual que pone Eduardo (0 = sin límite)
  const limiteMes = () => Number(ls.get("repasa:limiteMes") || 0);
  const limiteSuperado = () => {
    const g = gasto();
    return limiteMes() > 0 && g.mes === new Date().toISOString().slice(0, 7) && g.mesTotal >= limiteMes();
  };

  async function llamar(peticion, alTexto) {
    if (limiteSuperado()) throw new Error("Se ha llegado al límite de gasto de este mes. Díselo a Eduardo.");
    const s = cliente().beta.messages.stream({
      model: MODELO,
      max_tokens: 64000,
      ...peticion,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (alTexto) s.on("text", alTexto);
    const r = await s.finalMessage();
    if (r.stop_reason === "refusal") throw new Error("La IA no ha querido procesar esto. Prueba con otras fotos o con otra pregunta.");
    if (r.stop_reason === "max_tokens") throw new Error("Es demasiado largo para hacerlo de una vez. Divide las fotos en dos temas.");
    return { texto: textoFinal(r), coste: apuntar(r.usage || {}) };
  }

  async function pedirJSON(peticion, esquema, effort, alTexto) {
    const { texto, coste } = await llamar({ ...peticion, output_config: { effort, format: { type: "json_schema", schema: esquema } } }, alTexto);
    return { datos: JSON.parse(texto), coste };
  }

  // ---------- Esquemas (structured outputs: todo obligatorio y sin campos extra) ----------
  const txt = { type: "string" };
  const lista = (items) => ({ type: "array", items });
  const obj = (p) => ({ type: "object", properties: p, required: Object.keys(p), additionalProperties: false });
  const una = (...v) => ({ type: "string", enum: v });

  const ESQUEMA_TEMA = obj({
    asignatura: txt,
    titulo: txt,
    lectura: obj({ ok: { type: "boolean" }, avisos: lista(txt) }),
    idioma_original: txt,
    traduccion: lista(obj({ pagina: txt, texto: txt })),
    vocabulario: lista(obj({ original: txt, traduccion: txt, ejemplo: txt })),
    en_30_segundos: txt,
    por_que_importa: txt,
    apartados: lista(obj({ titulo: txt, paginas: txt, ideas: lista(txt), ejemplo: txt })),
    esquema: obj({ centro: txt, ramas: lista(obj({ nombre: txt, subramas: lista(obj({ nombre: txt, detalles: lista(txt) })) })) }),
    conceptos: lista(obj({ termino: txt, definicion: txt, con_tus_palabras: txt })),
    datos_clave: lista(obj({ tipo: una("fecha", "formula", "cifra", "persona", "lugar", "regla", "vocabulario", "otro"), dato: txt, explicacion: txt })),
    trucos_memoria: lista(obj({ para: txt, truco: txt })),
    errores_tipicos: lista(txt),
    preguntas_examen: lista(
      obj({
        pregunta: txt,
        tipo: una("definir", "explicar", "relacionar", "comparar", "aplicar", "ejercicio"),
        probabilidad: una("muy_probable", "probable"),
        respuesta_modelo: txt,
        claves: lista(txt),
      })
    ),
    test: lista(obj({ pregunta: txt, opciones: lista(txt), correcta: { type: "integer" }, explicacion: txt })),
    tarjetas: lista(obj({ frente: txt, reverso: txt })),
    presentacion: obj({
      duracion_minutos: { type: "integer" },
      guion: lista(obj({ parte: txt, minutos: txt, que_decir: txt })),
      consejos: lista(txt),
      preguntas_del_profe: lista(obj({ pregunta: txt, respuesta: txt })),
    }),
    fuera_del_libro: lista(txt),
  });

  const ESQUEMA_CORRECCION = obj({ nota: { type: "integer" }, bien: lista(txt), falta: lista(txt), mal: lista(txt), respuesta_mejorada: txt, consejo: txt });

  // ---------- Instrucciones ----------
  const SISTEMA_TEMA = `Eres el mejor profesor particular de España para una alumna de 3.º de ESO (14 años). Te pasa fotos de las páginas de su libro, de sus apuntes o de cualquier texto, y tú le preparas el material para entenderlo, estudiarlo y sacar la mejor nota posible en el examen o la presentación.

Cómo trabajas:
1. Lee TODAS las páginas con atención y en orden: títulos, texto, recuadros, definiciones en negrita, pies de foto, mapas, tablas, gráficos, ejercicios resueltos, actividades del final y lo que ella haya subrayado o escrito a mano. Lo resaltado por el libro o por ella es lo que más suele caer.
2. Fidelidad total. Todo lo que pongas sale de sus páginas. No inventes datos, fechas, cifras, nombres ni fórmulas. Si para entender algo hace falta un dato que no está, ponlo en «fuera_del_libro» y no lo mezcles con el resumen. Si una parte no se lee bien, está cortada o parece que falta una página (el texto salta), dilo en «lectura.avisos» indicando la página.
3. Completo antes que corto. Lo que pueda caer en el examen tiene que estar. Se tiene que poder estudiar SOLO con tu material, sin volver al libro. Quita la paja, no el contenido.
4. Lenguaje para 14 años: frases cortas, claras y directas, sin infantilizar. Mantén los términos técnicos exactos que pide el profesor y explícalos. Marca con **negrita** la palabra clave de cada idea (solo **negrita**: nada de títulos con #, tablas ni otro formato).
5. Adapta el material a la asignatura:
   - Matemáticas, Física y Química: fórmulas con el significado de cada letra y sus unidades, el método paso a paso y un ejercicio resuelto tipo en «ejemplo». En las preguntas de examen incluye ejercicios parecidos a los del libro con la solución desarrollada.
   - Historia y Geografía: orden cronológico, causas → hechos → consecuencias, personajes y lugares con su importancia.
   - Biología y Geología: procesos paso a paso, partes y funciones, comparaciones.
   - Lengua y Literatura: definiciones, características, ejemplos, autores y obras.
   - Idiomas (inglés, francés…): la regla gramatical con su estructura, ejemplos con traducción y el vocabulario con su traducción.
6. Preguntas de examen: las que pondría un profesor de 3.º de ESO con este material (las actividades del libro dan pistas). La «respuesta_modelo» es la que sacaría un 10: completa, bien estructurada y con el vocabulario correcto, del tamaño que se escribe en un examen real. En «claves», lo que el profesor busca para dar la puntuación completa.
7. Test: preguntas de verdad (no obvias), 4 opciones, distractores creíbles, una sola correcta («correcta» es su posición: 0, 1, 2 o 3; varíala) y una explicación breve.
8. Tarjetas: una idea por tarjeta. Frente corto (pregunta o término) y reverso breve.
9. Trucos para memorizar: solo los que funcionen de verdad (siglas, frases, asociaciones, rimas, pequeñas historias). Mejor pocos y buenos.
10. Errores típicos: las confusiones reales que tienen los alumnos con este tema.
11. Presentación: rellénala solo si el objetivo es una presentación oral; si no, 0 minutos y listas vacías. El guion va en primera persona, natural, como hablaría ella, con una entrada que enganche y un cierre claro, ajustado a la duración que diga el profesor (si no la dice, 5 minutos). Añade consejos para exponer y las preguntas que le puede hacer el profesor, con su respuesta.
12. Traducción: rellena «traduccion» y «vocabulario» solo si te lo piden. La traducción es completa y fiel, página a página, natural en el idioma de destino y conservando párrafos, listas y diálogos (usa saltos de línea). En «vocabulario», las palabras y expresiones útiles del texto original con su traducción y un ejemplo corto. En «idioma_original» pon el idioma de las fotos (por ejemplo «Inglés»). Si no te piden traducción, deja las dos listas vacías.

Cantidad orientativa (más si el tema es largo, nunca relleno): los apartados que pida el tema; 8-15 preguntas de examen; 10-15 preguntas de test; 15-35 tarjetas; todos los conceptos y datos clave que haya.

Si las fotos no son material de estudio ni un texto que traducir, o no se lee nada, pon «lectura.ok» en false, explícalo con amabilidad en los avisos y deja el resto vacío.

Escribe todo en el IDIOMA DEL MATERIAL que te indiquen (si no lo indican, español de España). Es una menor: mantén siempre un contenido apropiado y un tono cercano y alentador, sin exagerar.`;

  const OBJETIVO = {
    examen: "prepararse un examen escrito",
    test: "prepararse un examen tipo test (haz 20 preguntas de test)",
    presentacion: "preparar una presentación oral",
    entender: "entender bien el tema",
    traducir: "traducir el texto y entenderlo",
  };

  async function hacerTema(fotos, op, alTexto) {
    const contenido = [];
    fotos.forEach((data, i) => {
      contenido.push({ type: "text", text: `Página ${i + 1}:` });
      contenido.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
    });
    const lineas = [
      `Objetivo: ${OBJETIVO[op.objetivo] || OBJETIVO.examen}.`,
      `IDIOMA DEL MATERIAL: ${op.idioma || "español"}.`,
      op.objetivo === "traducir" ? `Traduce TODO el texto de las fotos al ${op.idioma || "español"} y prepara también el material de estudio sobre su contenido.` : "No hace falta traducción.",
      op.dias != null ? `El examen o la presentación es dentro de ${op.dias} días.` : "",
      op.notas ? `Lo que ha dicho el profesor o lo que pide ella: ${op.notas}` : "",
      "Prepárale su material.",
    ];
    contenido.push({ type: "text", text: lineas.filter(Boolean).join("\n") });
    const { datos, coste } = await pedirJSON(
      { system: SISTEMA_TEMA, max_tokens: op.objetivo === "traducir" ? 128000 : 64000, messages: [{ role: "user", content: contenido }] },
      ESQUEMA_TEMA,
      "high",
      alTexto
    );
    // Quita preguntas de test mal formadas (sin 2 opciones o con la correcta fuera de rango)
    datos.test = (datos.test || []).filter((q) => q.opciones.length >= 2 && q.correcta >= 0 && q.correcta < q.opciones.length);
    return { datos, coste };
  }

  const resumenTexto = (r) =>
    JSON.stringify({ asignatura: r.asignatura, titulo: r.titulo, apartados: r.apartados, conceptos: r.conceptos, datos_clave: r.datos_clave, traduccion: r.traduccion, fuera_del_libro: r.fuera_del_libro });

  async function corregir(tema, q, respuesta) {
    const r = tema.resumen;
    return pedirJSON(
      {
        max_tokens: 16000,
        system: `Eres un profesor de 3.º de ESO corrigiendo una respuesta de examen de una alumna de 14 años. Corrige como un profesor justo pero exigente: compara con la respuesta modelo, las claves y el material del tema (sale de su libro). «nota»: entero de 0 a 10. «bien»: lo que ha hecho bien. «falta»: lo que le falta para el 10. «mal»: errores o confusiones (vacío si no hay). «respuesta_mejorada»: su propia respuesta reescrita para sacar un 10, manteniendo su forma de escribir. «consejo»: una frase concreta para la próxima vez. Si la respuesta está vacía o no tiene que ver, nota 0 y explícalo con amabilidad. Escribe en el idioma del material (${tema.idioma || "español"}).`,
        messages: [
          {
            role: "user",
            content: `MATERIAL DEL TEMA:\n${resumenTexto(r)}\n\nPREGUNTA: ${q.pregunta}\nRESPUESTA MODELO: ${q.respuesta_modelo}\nCLAVES: ${q.claves.join(" | ")}\n\nRESPUESTA DE LA ALUMNA:\n${respuesta}`,
          },
        ],
      },
      ESQUEMA_CORRECCION,
      "medium"
    );
  }

  // Sus aficiones, para poner ejemplos que le lleguen
  const gustos = () => {
    const g = (ls.get("repasa:gustos") || "").trim();
    return g ? `\nLe gusta: ${g}. Cuando encaje de forma natural, usa ejemplos o comparaciones de eso (sin forzarlo y sin cambiar el contenido).` : "";
  };

  async function explicar(tema, apartado) {
    return llamar({
      max_tokens: 8000,
      output_config: { effort: "low" },
      system: `Eres un profesor particular de una alumna de 3.º de ESO. Explica la parte que te pasa de la forma más fácil posible: como se lo contarías a una amiga, con un ejemplo o comparación de la vida diaria. Máximo 120 palabras. Sin inventar datos que no estén. Formato: texto plano, **negrita** para lo clave y listas con guiones si ayudan. Escribe en ${tema.idioma || "español"}.${gustos()}`,
      messages: [{ role: "user", content: `Asignatura: ${tema.resumen.asignatura}\n${JSON.stringify(apartado)}` }],
    });
  }

  const SISTEMA_DUDAS = `Eres el profesor particular de una alumna de 3.º de ESO (14 años) y resuelves sus dudas sobre el tema que tienes abajo (sale de las fotos de su libro o apuntes).
- Respuestas cortas y claras (unas 150 palabras como mucho, salvo que pida más), con un ejemplo cuando ayude.
- Si pregunta algo que no está en su material, puedes explicarlo, pero avisa de que no viene en sus páginas.
- Si te pide que le preguntes, hazle las preguntas de una en una y corrige cada respuesta antes de seguir.
- Si te pide que le hagas los deberes, guíala paso a paso para que los haga ella y comprueba su resultado.
- Formato: texto plano, **negrita** para lo clave y listas con guiones. Nada de tablas ni títulos con #.
- Es una menor: si la conversación se sale del estudio, llévala de vuelta con amabilidad.
- Responde en el idioma en que te escriba.`;

  async function charlar(tema, historial, alTexto) {
    return llamar(
      {
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: SISTEMA_DUDAS + gustos() },
          { type: "text", text: "TEMA:\n" + JSON.stringify(tema.resumen), cache_control: { type: "ephemeral" } },
        ],
        messages: historial,
      },
      alTexto
    );
  }

  // ---------- Corregir un ejercicio o una redacción por foto ----------
  const ESQUEMA_FOTO = obj({
    tipo: una("ejercicio", "redaccion", "respuesta", "otro"),
    enunciado_leido: txt,
    nota: { type: "integer" },
    resumen: txt,
    pasos: lista(obj({ paso: txt, bien: { type: "boolean" }, comentario: txt })),
    errores: lista(txt),
    solucion: txt,
    consejo: txt,
  });

  async function corregirFoto(tema, fotos, enunciado) {
    const idioma = tema?.idioma || "español";
    const contenido = fotos.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }));
    contenido.push({
      type: "text",
      text: [
        enunciado ? `Enunciado (me lo da ella): ${enunciado}` : "No me da el enunciado: búscalo en la foto.",
        tema ? `Es del tema «${tema.resumen.titulo}» (${tema.resumen.asignatura}). Material del tema:\n${resumenTexto(tema.resumen)}` : "",
        "Corrige lo que ha hecho.",
      ].filter(Boolean).join("\n\n"),
    });
    return pedirJSON(
      {
        max_tokens: 32000,
        system: `Eres un profesor de 3.º de ESO que corrige el trabajo de una alumna de 14 años. Te pasa la foto de un ejercicio, problema, redacción o respuesta que ha hecho ella (a mano o a ordenador).
1. Lee con atención el enunciado (si viene en la foto o te lo da ella) y todo lo que ha hecho. Ponlo en «enunciado_leido». Si no hay enunciado y no se puede deducir, dilo en «resumen» y corrige lo que se pueda.
2. Revisa paso a paso cada operación, razonamiento o frase. En «pasos» va lo que ha hecho, dividido en pasos, cada uno marcado como bien o mal y con un comentario corto. En una redacción de idiomas, cada frase con fallo y su corrección.
3. «nota»: de 0 a 10, como la pondría un profesor justo (el planteamiento bien hecho puntúa aunque falle una cuenta).
4. «errores»: los fallos importantes, explicados para que no los repita.
5. «solucion»: la resolución correcta completa, paso a paso (o la redacción corregida entera).
6. «consejo»: una frase concreta para la próxima vez.
7. «resumen»: una o dos frases con cómo le ha ido, en tono cercano y alentador.
Si algo no se lee, dilo. Si la foto no es un ejercicio ni un trabajo suyo, «tipo» = otro, nota 0 y explícalo con amabilidad. Formato: texto plano y **negrita** para lo clave. Escribe en ${idioma}, salvo las correcciones de una redacción en otro idioma, que van en ese idioma con la explicación en ${idioma}.`,
        messages: [{ role: "user", content: contenido }],
      },
      ESQUEMA_FOTO,
      "high"
    );
  }

  // ---------- Ejercicios nuevos para practicar ----------
  const ESQUEMA_PRACTICA = obj({ ejercicios: lista(obj({ enunciado: txt, dificultad: una("facil", "media", "dificil"), pista: txt, solucion: txt })) });

  async function ejerciciosParecidos(tema, anteriores) {
    return pedirJSON(
      {
        max_tokens: 32000,
        system: `Eres un profesor de 3.º de ESO. Crea 5 ejercicios NUEVOS para que una alumna practique este tema, del estilo de los del libro y de los que pondrían en el examen, ordenados de fácil a difícil.
- Matemáticas, Física o Química: problemas con datos nuevos, del mismo tipo que los del tema.
- Idiomas: ejercicios de gramática y vocabulario (completar, transformar, traducir frases).
- Resto de asignaturas: preguntas de aplicar, relacionar y razonar (no de copiar definiciones).
Cada uno con una «pista» que ayude sin dar la respuesta y la «solucion» completa paso a paso. Usa solo contenidos del tema y no repitas los ejercicios anteriores. Formato: texto plano, **negrita** para lo clave y saltos de línea entre pasos. Escribe en ${tema.idioma || "español"}.`,
        messages: [{ role: "user", content: `MATERIAL DEL TEMA:\n${JSON.stringify(tema.resumen)}\n\nEJERCICIOS ANTERIORES (no los repitas):\n${anteriores.join("\n") || "ninguno"}` }],
      },
      ESQUEMA_PRACTICA,
      "medium"
    );
  }

  // ---------- Explicación en voz alta ----------
  const ESQUEMA_ORAL = obj({ nota: { type: "integer" }, bien: lista(txt), falta: lista(txt), mal: lista(txt), como_lo_dices: txt, consejo: txt });

  async function corregirOral(tema, parte, transcripcion) {
    return pedirJSON(
      {
        max_tokens: 16000,
        system: `Eres un profesor de 3.º de ESO evaluando una explicación oral de una alumna de 14 años, como en un examen oral o una exposición. Te llega transcrita del micrófono: puede tener fallos de transcripción y no tiene signos de puntuación; no se los cuentes como errores. Compara con el material del tema.
«nota»: de 0 a 10. «bien»: lo que ha explicado bien. «falta»: lo importante que no ha dicho. «mal»: errores de contenido (vacío si no hay). «como_lo_dices»: cómo se expresa (orden, claridad, vocabulario técnico, muletillas que se repitan mucho), en dos o tres frases. «consejo»: una frase concreta para la próxima vez. Tono cercano y alentador. Escribe en ${tema.idioma || "español"}.`,
        messages: [{ role: "user", content: `MATERIAL DEL TEMA:\n${resumenTexto(tema.resumen)}\n\nLO QUE TENÍA QUE EXPLICAR: ${parte}\n\nLO QUE HA DICHO:\n${transcripcion}` }],
      },
      ESQUEMA_ORAL,
      "medium"
    );
  }

  // ---------- Simulacro: corrige todas las respuestas escritas de una vez ----------
  const ESQUEMA_SIMULACRO = obj({ correcciones: lista(obj({ nota: { type: "integer" }, comentario: txt })), comentario_general: txt });

  async function corregirSimulacro(tema, items) {
    return pedirJSON(
      {
        max_tokens: 16000,
        system: `Eres un profesor de 3.º de ESO corrigiendo un simulacro de examen de una alumna de 14 años. Para cada respuesta (en el mismo orden en que te llegan) da una «nota» de 0 a 10 y un «comentario» breve: qué falta o qué está mal para el 10. Compara con la respuesta modelo y las claves; sé justo pero exigente, como en un examen real. Una respuesta vacía es un 0. «comentario_general»: dos o tres frases sobre lo que debe repasar antes del examen de verdad. Escribe en ${tema.idioma || "español"}.`,
        messages: [{ role: "user", content: JSON.stringify(items.map((x, n) => ({ numero: n + 1, pregunta: x.pregunta, respuesta_modelo: x.respuesta_modelo, claves: x.claves, respuesta_de_la_alumna: x.respuesta || "(en blanco)" }))) }],
      },
      ESQUEMA_SIMULACRO,
      "medium"
    );
  }

  // ---------- Juntar varios temas en uno (examen de evaluación) ----------
  async function combinar(temas, op, alTexto) {
    const lineas = [
      "Esta vez no hay fotos: te paso el material ya preparado de varios temas que entran juntos en el mismo examen. Júntalos en un solo material: ordena y relaciona los temas, no repitas lo mismo dos veces y mezcla temas en las preguntas, el test y las tarjetas. En «paginas» pon de qué tema sale cada apartado. No hace falta traducción.",
      `Objetivo: ${OBJETIVO[op.objetivo] || OBJETIVO.examen}.`,
      `IDIOMA DEL MATERIAL: ${op.idioma || "español"}.`,
      op.dias != null ? `El examen es dentro de ${op.dias} días.` : "",
      op.notas ? `Lo que ha dicho el profesor o lo que pide ella: ${op.notas}` : "",
      ...temas.map((t, i) => `TEMA ${i + 1}:\n${JSON.stringify(t.resumen)}`),
    ];
    const { datos, coste } = await pedirJSON(
      { system: SISTEMA_TEMA, messages: [{ role: "user", content: lineas.filter(Boolean).join("\n\n") }] },
      ESQUEMA_TEMA,
      "high",
      alTexto
    );
    datos.test = (datos.test || []).filter((q) => q.opciones.length >= 2 && q.correcta >= 0 && q.correcta < q.opciones.length);
    return { datos, coste };
  }

  async function probarClave() {
    await cliente().models.retrieve(MODELO);
  }

  function traducirError(e) {
    const A = window.AnthropicSDK;
    const m = e?.message || String(e);
    if (A && e instanceof A.AuthenticationError) return "La clave de la IA no es válida. Revísala en Ajustes.";
    if (A && e instanceof A.PermissionDeniedError) return "La clave no tiene permiso para usar la IA. Díselo a Eduardo.";
    if (A && e instanceof A.RateLimitError) return "Demasiadas consultas seguidas o se ha llegado al límite de gasto. Espera un poco o díselo a Eduardo.";
    if (A && e instanceof A.APIConnectionError) return "No hay conexión con la IA. Revisa internet y vuelve a intentarlo.";
    if (A && e instanceof A.APIError && e.status === 413) return "Las fotos pesan demasiado juntas. Divide el tema en dos.";
    if (A && e instanceof A.APIError && e.status >= 500) return "La IA está saturada ahora mismo. Inténtalo en un par de minutos.";
    if (/credit|balance/i.test(m)) return "La cuenta de la IA no tiene saldo. Díselo a Eduardo.";
    if (e instanceof SyntaxError) return "La respuesta llegó incompleta. Vuelve a intentarlo.";
    return m;
  }

  return {
    hacerTema, corregir, explicar, charlar, probarClave, traducirError, gasto,
    corregirFoto, ejerciciosParecidos, corregirOral, corregirSimulacro, combinar, limiteMes,
    tieneClave: () => !!clave(),
    clave,
    ponerClave: (k) => ls.set("repasa:clave", k.trim()),
  };
})();
