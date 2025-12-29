// src/app/admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";

type EventDoc = {
  title: string;
  maxApproved: number;
  approvedCount: number;
  isopen: boolean;
};

type EventItem = EventDoc & { id: string };

export default function AdminPage() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  const loadEvents = async () => {
    setStatus("");
    const q = query(collection(db, "events"), orderBy("title", "asc"));
    const snap = await getDocs(q);
    const data: EventItem[] = snap.docs.map((d) => {
      const raw = d.data() as Partial<EventDoc>;
      return {
        id: d.id,
        title: String(raw.title ?? ""),
        maxApproved: Number(raw.maxApproved ?? 0),
        approvedCount: Number(raw.approvedCount ?? 0),
        isopen: Boolean(raw.isopen ?? false),
      };
    });
    setEvents(data);
  };

  const loadRequests = async (eventId: string) => {
    const q = query(collection(db, "events", eventId, "requests"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    if (user) loadEvents().catch((e) => setStatus(String(e?.message ?? e)));
  }, [user]);

  const login = async () => {
    setStatus("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setEmail("");
      setPassword("");
    } catch (e: any) {
      setStatus(`❌ Login fejl: ${e?.message ?? e}`);
    }
  };

  const toggleOpen = async (ev: EventItem) => {
    setStatus("");
    try {
      await updateDoc(doc(db, "events", ev.id), { isopen: !ev.isopen });
      await loadEvents();
      if (selectedEvent?.id === ev.id) {
        setSelectedEvent({ ...ev, isopen: !ev.isopen });
      }
    } catch (e: any) {
      setStatus(`❌ Fejl: ${e?.message ?? e}`);
    }
  };

  const resetCount = async (ev: EventItem) => {
    setStatus("");
    try {
      await updateDoc(doc(db, "events", ev.id), { approvedCount: 0 });
      await loadEvents();
      if (selectedEvent?.id === ev.id) {
        setSelectedEvent({ ...ev, approvedCount: 0 });
      }
    } catch (e: any) {
      setStatus(`❌ Fejl: ${e?.message ?? e}`);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", padding: 24, display: "flex", justifyContent: "center" },
    wrap: { width: "100%", maxWidth: 900 },
    card: { border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 12, background: "#fff" },
    row: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
    input: { padding: 12, borderRadius: 10, border: "1px solid #ddd", minWidth: 260 },
    btn: { padding: "12px 14px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 700 },
    btn2: { padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 700 },
    h1: { margin: 0 },
    status: { marginTop: 10, fontWeight: 700 },
    table: { width: "100%", borderCollapse: "collapse" },
    thtd: { borderBottom: "1px solid #eee", padding: "8px 6px", textAlign: "left" as const },
    pill: { fontSize: 12, padding: "4px 8px", borderRadius: 999, border: "1px solid #ddd" },
  };

  if (!user) {
    return (
      <main style={styles.page}>
        <div style={styles.wrap}>
          <h1 style={styles.h1}>Admin</h1>
          <div style={styles.card}>
            <div style={styles.row}>
              <input
                style={styles.input}
                placeholder="Admin e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button style={styles.btn} onClick={login}>Log ind</button>
            </div>
            {status && <div style={styles.status}>{status}</div>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={styles.h1}>Admin</h1>
          <button style={styles.btn2} onClick={() => signOut(auth)}>Log ud</button>
        </div>

        <div style={styles.card}>
          <div style={{ ...styles.row, justifyContent: "space-between" }}>
            <div style={{ fontWeight: 800 }}>Events</div>
            <button style={styles.btn2} onClick={loadEvents}>Genindlæs</button>
          </div>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thtd}>Titel</th>
                <th style={styles.thtd}>Åben</th>
                <th style={styles.thtd}>Pladser</th>
                <th style={styles.thtd}>Handling</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td style={styles.thtd}>
                    <button
                      style={{ ...styles.btn2, padding: "6px 10px" }}
                      onClick={async () => {
                        setSelectedEvent(ev);
                        await loadRequests(ev.id);
                      }}
                    >
                      {ev.title}
                    </button>
                  </td>
                  <td style={styles.thtd}>
                    <span style={styles.pill}>{ev.isopen ? "JA" : "NEJ"}</span>
                  </td>
                  <td style={styles.thtd}>
                    {ev.approvedCount} / {ev.maxApproved}
                  </td>
                  <td style={styles.thtd}>
                    <div style={styles.row}>
                      <button style={styles.btn2} onClick={() => toggleOpen(ev)}>
                        {ev.isopen ? "Luk" : "Åbn"}
                      </button>
                      <button style={styles.btn2} onClick={() => resetCount(ev)}>
                        Nulstil count
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {status && <div style={styles.status}>{status}</div>}
        </div>

        <div style={styles.card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Requests {selectedEvent ? `— ${selectedEvent.title}` : ""}
          </div>
          {!selectedEvent ? (
            <div>Vælg et event for at se requests.</div>
          ) : requests.length === 0 ? (
            <div>Ingen requests endnu.</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thtd}>Brugernavn</th>
                  <th style={styles.thtd}>E-mail</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td style={styles.thtd}>{r.username ?? ""}</td>
                    <td style={styles.thtd}>{r.email ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
