/* Armazenamento local: metadados (localStorage) + arquivos originais (IndexedDB) */
(function (global) {
  "use strict";

  var KEY_G = "gv_galerias_v2";
  var KEY_C = "gv_clientes_v2";
  var DB_NAME = "gv_fotos_db";
  var DB_STORE = "arquivos";
  var DB_VERSION = 1;
  var dbPromise = null;

  function ler(chave, padrao) {
    try {
      var raw = localStorage.getItem(chave);
      if (!raw) return padrao;
      return JSON.parse(raw);
    } catch (e) {
      return padrao;
    }
  }

  function gravar(chave, valor) {
    localStorage.setItem(chave, JSON.stringify(valor));
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = function (e) {
        resolve(e.target.result);
      };
      req.onerror = function (e) {
        reject(e.target.error);
      };
    });
    return dbPromise;
  }

  function idbPut(key, blob) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(blob, key);
        tx.oncomplete = function () {
          resolve(key);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function idbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, "readonly");
        var req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function idbDel(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  var urlCache = {};

  global.GVStore = {
    listarGalerias: function () {
      return ler(KEY_G, []);
    },
    salvarGalerias: function (lista) {
      gravar(KEY_G, lista || []);
    },
    listarClientes: function () {
      return ler(KEY_C, []);
    },
    salvarClientes: function (lista) {
      gravar(KEY_C, lista || []);
    },
    uid: function (prefix) {
      return (
        (prefix || "id") +
        "_" +
        Date.now() +
        "_" +
        Math.random().toString(36).slice(2, 8)
      );
    },

    /** Salva arquivo original (sem recomprimir) e devolve metadados */
    salvarArquivo: function (file) {
      var key = "file_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      return idbPut(key, file).then(function () {
        return {
          storageKey: key,
          name: file.name || "foto.jpg",
          mime: file.type || "image/jpeg",
          size: file.size || 0,
        };
      });
    },

    /** URL temporária para exibir a imagem (blob://) */
    urlDoArquivo: function (storageKey) {
      if (!storageKey) return Promise.resolve(null);
      if (urlCache[storageKey]) return Promise.resolve(urlCache[storageKey]);
      return idbGet(storageKey).then(function (blob) {
        if (!blob) return null;
        var url = URL.createObjectURL(blob);
        urlCache[storageKey] = url;
        return url;
      });
    },

    /** Download do arquivo original, sem perda de qualidade */
    baixarArquivo: function (storageKey, nomeArquivo) {
      return idbGet(storageKey).then(function (blob) {
        if (!blob) throw new Error("Arquivo não encontrado neste navegador.");
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = nomeArquivo || "foto.jpg";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 2000);
      });
    },

    apagarArquivo: function (storageKey) {
      if (urlCache[storageKey]) {
        try {
          URL.revokeObjectURL(urlCache[storageKey]);
        } catch (e) {}
        delete urlCache[storageKey];
      }
      return idbDel(storageKey);
    },
  };
})(window);
