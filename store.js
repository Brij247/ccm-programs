// Data layer. Same interface for Firebase (shared) and localStorage (single browser).
import { SEED } from "./seed.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

export async function createStore(config) {
  if (config && config.apiKey && config.projectId) return createFirebaseStore(config);
  return createLocalStore();
}

async function createFirebaseStore(config) {
  const { initializeApp } = await import(FB + "firebase-app.js");
  const fs = await import(FB + "firebase-firestore.js");
  const app = initializeApp(config);
  const db = fs.getFirestore(app);
  const col = fs.collection(db, "programs");
  const metaRef = fs.doc(db, "meta", "seed");

  async function seedIfNeeded() {
    const meta = await fs.getDoc(metaRef);
    if (meta.exists()) return;
    const batch = fs.writeBatch(db);
    for (const { id, ...p } of SEED) batch.set(fs.doc(col, id), { ...p, updatedAt: Date.now(), updatedBy: "" });
    batch.set(metaRef, { seededAt: Date.now() });
    await batch.commit();
  }

  return {
    mode: "shared",
    subscribe(onData, onError) {
      let seedChecked = false;
      return fs.onSnapshot(
        fs.query(col, fs.orderBy("order")),
        (snap) => {
          if (snap.empty && !snap.metadata.fromCache && !seedChecked) {
            seedChecked = true;
            seedIfNeeded().catch(onError);
          }
          onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        onError
      );
    },
    add: (p) => fs.addDoc(col, p),
    update: (id, fields) => fs.updateDoc(fs.doc(col, id), fields),
    // arrayUnion / arrayRemove so two people editing at once don't overwrite each other.
    addParticipants: (id, names, stamp) =>
      fs.updateDoc(fs.doc(col, id), { participants: fs.arrayUnion(...names), ...stamp }),
    removeParticipant: (id, name, stamp) =>
      fs.updateDoc(fs.doc(col, id), { participants: fs.arrayRemove(name), ...stamp }),
    remove: (id) => fs.deleteDoc(fs.doc(col, id)),
  };
}

function createLocalStore() {
  const KEY = "ccm-programs-v1";
  const listeners = new Set();
  const load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return structuredClone(SEED);
  };
  let data = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    emit();
  };
  const emit = () => {
    const sorted = [...data].sort((a, b) => a.order - b.order);
    listeners.forEach((fn) => fn(structuredClone(sorted)));
  };
  const find = (id) => data.find((p) => p.id === id);
  window.addEventListener("storage", (e) => { if (e.key === KEY) { data = load(); emit(); } });

  return {
    mode: "local",
    subscribe(onData) { listeners.add(onData); onData([...data].sort((a, b) => a.order - b.order)); return () => listeners.delete(onData); },
    async add(p) { data.push({ id: "l" + Date.now().toString(36), ...p }); save(); },
    async update(id, fields) { Object.assign(find(id), fields); save(); },
    async addParticipants(id, names, stamp) {
      const p = find(id);
      for (const n of names) if (!p.participants.includes(n)) p.participants.push(n);
      Object.assign(p, stamp); save();
    },
    async removeParticipant(id, name, stamp) {
      const p = find(id);
      p.participants = p.participants.filter((x) => x !== name);
      Object.assign(p, stamp); save();
    },
    async remove(id) { data = data.filter((p) => p.id !== id); save(); },
  };
}
