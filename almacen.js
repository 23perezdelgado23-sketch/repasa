// Guarda los temas (con sus fotos) en el propio móvil. Solo salen de aquí las fotos que se mandan a la IA.
const Almacen = (() => {
  let db;
  const abrir = () =>
    db ||
    (db = new Promise((ok, mal) => {
      const r = indexedDB.open("repasa", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("temas", { keyPath: "id" });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    }));
  const tx = async (modo, fn) => {
    const d = await abrir();
    return new Promise((ok, mal) => {
      const t = d.transaction("temas", modo);
      const r = fn(t.objectStore("temas"));
      t.oncomplete = () => ok(r.result);
      t.onerror = () => mal(t.error);
    });
  };
  return {
    todos: () => tx("readonly", (s) => s.getAll()),
    leer: (id) => tx("readonly", (s) => s.get(id)),
    guardar: (tema) => tx("readwrite", (s) => s.put({ ...tema, actualizado: Date.now() })),
    borrar: (id) => tx("readwrite", (s) => s.delete(id)),
  };
})();
