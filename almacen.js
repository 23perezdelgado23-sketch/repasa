// Guarda los temas y los libros (con sus fotos) en el propio móvil. Solo salen de aquí las fotos que se mandan a la IA.
const Almacen = (() => {
  let db;
  const abrir = () =>
    db ||
    (db = new Promise((ok, mal) => {
      const r = indexedDB.open("repasa", 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("temas")) d.createObjectStore("temas", { keyPath: "id" });
        if (!d.objectStoreNames.contains("libros")) d.createObjectStore("libros", { keyPath: "id" });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    }));
  const tx = async (almacen, modo, fn) => {
    const d = await abrir();
    return new Promise((ok, mal) => {
      const t = d.transaction(almacen, modo);
      const r = fn(t.objectStore(almacen));
      t.oncomplete = () => ok(r.result);
      t.onerror = () => mal(t.error);
    });
  };
  const coleccion = (almacen) => ({
    todos: () => tx(almacen, "readonly", (s) => s.getAll()),
    leer: (id) => tx(almacen, "readonly", (s) => s.get(id)),
    guardar: (x) => tx(almacen, "readwrite", (s) => s.put({ ...x, actualizado: Date.now() })),
    borrar: (id) => tx(almacen, "readwrite", (s) => s.delete(id)),
  });
  return { ...coleccion("temas"), libros: coleccion("libros") };
})();
