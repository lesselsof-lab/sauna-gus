"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  increment,
} from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../lib/firebase";

type Request = {
  id: string;
  username: string;
  phone: string;
  status: string;
};

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [requests, setRequests] = useState<Request[]>([]);

  // 👇 VIGTIGT: Dette skal være dit event dokument-id i Firestore
  const eventId = "08012026";

  const login = async () => {
    await signInWithEmailAndPassword(auth, email, password);
    setLoggedIn(true);
  };

  const loadRequests = async () => {
    const snap = await getDocs(collection(db, "events", eventId, "requests"));
    setRequests(
      snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Request, "id">),
      }))
    );
  };

  useEffect(() => {
    if (!loggedIn) return;
    loadRequests();
  }, [loggedIn]);

  const approve = async (id: string) => {
    await updateDoc(doc(db, "events", eventId, "requests", id), {
      status: "approved",
    });

    await updateDoc(doc(db, "events", eventId), {
      approvedCount: increment(1),
    });

    await loadRequests();
  };

  const reject = async (id: string) => {
    await updateDoc(doc(db, "events", eventId, "requests", id), {
      status: "rejected",
    });

    await loadRequests();
  };

  if (!loggedIn) {
    return (
      <main style={{ padding: 20, maxWidth: 420 }}>
        <h1>Admin login</h1>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <input
          type="password"
          placeholder="Kodeord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 12 }}
        />
        <button onClick={login} style={{ padding: "8px 12px" }}>
          Log ind
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 20, maxWidth: 700 }}>
      <h1>Tilmeldinger</h1>
      <button onClick={loadRequests} style={{ padding: "6px 10px", marginBottom: 12 }}>
        Opdater
      </button>

      {requests.length === 0 && <p>Ingen tilmeldinger endnu.</p>}

      {requests.map((r) => (
        <div
          key={r.id}
          style={{ border: "1px solid #ccc", padding: 10, marginBottom: 10 }}
        >
          <p style={{ margin: 0 }}>
            <b>{r.username}</b> – {r.phone} – <i>{r.status}</i>
          </p>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button onClick={() => approve(r.id)}>Godkend</button>
            <button onClick={() => reject(r.id)}>Afvis</button>
          </div>
        </div>
      ))}
    </main>
  );
}
