import { STATE } from '../core';

export async function createSqliteAdapter(name) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('actions', {
        keyPath: 'id',
        autoIncrement: true,
      });
      store.createIndex('idempotency_key', 'idempotency_key', { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });


  function transact(mode, work) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('actions', mode);
      let result;
      work(tx.objectStore('actions'), (value) => {
        result = value;
      });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage transaction interrupted'));
    });
  }


  const all = () =>
    transact('readonly', (store, done) => {
      store.getAll().onsuccess = (event) => done(event.target.result);
    });


  const byStates = async (states) =>
    (await all()).filter((row) => states.includes(row.state));
  
  
  return {
    init: async () => {},
    insert: (row) =>
      transact('readwrite', (store, done) => {
        store.add(row).onsuccess = (event) => done({ ...row, id: event.target.result });
      }),
    all,
    byStates,
    nextUnsettled: async () => (await byStates([STATE.QUEUED, STATE.SENDING]))[0] || null,
    update: (id, patch) =>
      transact('readwrite', (store, done) => {
        store.get(id).onsuccess = (event) => {
          const row = { ...event.target.result, ...patch };
          store.put(row);
          done(row);
        };
      }),
    resetSending: () =>
      transact('readwrite', (store, done) => {
        store.getAll().onsuccess = (event) => {
          const stuck = event.target.result.filter((row) => row.state === STATE.SENDING);
          stuck.forEach((row) => store.put({ ...row, state: STATE.QUEUED }));
          done(stuck.length);
        };
      }),
    countByStates: async (states) => (await byStates(states)).length,
    deleteByStates: (states) =>
      transact('readwrite', (store) => {
        store.getAll().onsuccess = (event) =>
          event.target.result
            .filter((row) => states.includes(row.state))
            .forEach((row) => store.delete(row.id));
      }),
  };
}
