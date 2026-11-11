(() => {
  'use strict';

  const storeName = 'issues';
  const legacyPrefix = 'lukfook:store-visit:issue:';
  let opening;

  function open() {
    opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('lukfook-store-visit', 1);
      const migrated = new Map();

      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(storeName, { keyPath: 'id' });
        try {
          const storage = window.localStorage;
          for (const key of Object.keys(storage).filter((key) => key.startsWith(legacyPrefix))) {
            const raw = storage.getItem(key);
            if (raw === null) continue;
            store.put(JSON.parse(raw));
            migrated.set(key, raw);
          }
        } catch {
          request.transaction.abort();
        }
      };

      request.onsuccess = () => {
        // Remove old copies only once the IndexedDB migration has committed.
        for (const [key, raw] of migrated) {
          try {
            if (window.localStorage.getItem(key) === raw) window.localStorage.removeItem(key);
          } catch {
            // The migrated records are already available in IndexedDB.
          }
        }
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
    return opening;
  }

  async function list() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function change(issue, previous, remove = false) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.get(issue.id);
      let conflict = false;

      request.onsuccess = () => {
        const current = request.result;
        conflict = previous
          ? !current || current.revision !== previous.revision
          : Boolean(current);
        if (conflict) return;
        if (remove) store.delete(issue.id);
        else store.put(issue);
      };

      transaction.oncomplete = () => resolve(!conflict);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  window.storeVisitDB = { list, change };
})();
