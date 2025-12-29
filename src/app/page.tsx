// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  doc,
} from "firebase/firestore";
import { db } from "../lib/firebase";

type EventDoc = {
  title: string;
  startAt?: any;
  maxApproved: number;
  approvedCount: number;
  isopen: boolean; // OBS: dit felt hedder isopen (små bogstaver)
};

type EventItem = EventDoc & { id: string };

export default function HomePage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  useEffect(() => {
    const load = async () => {
      setStatus("");
      const q = query(collection(db, "events"), orderBy("startAt", "asc"));
      const snap = await getDocs(q);

      const data: EventItem[] = snap.docs.map((d) => {
        const raw = d.data() as Partial<EventDoc>;
        return {
          id: d.id,
          title: String(raw.title ?? ""),
          maxApproved: Number(raw.maxApproved ?? 0),
          approvedCount: Number(raw.approvedCount ?? 0),
          isopen: Boolean(raw.isopen ?? false),
          startAt: raw.startAt,
        };
      });

      // Kun åbne events
      setEvents(data.filter((e) => e.isopen));
    };

    load().catch((e) => setStatus(`Fejl ved hentning af events: ${e?.message ?? e}`));
  }, []);

  const submit = async () => {
    setStatus("");
    if (!selectedEvent) {
      setStatus("Vælg et event først.");
      return;
    }
    if (!username.trim() || !email.trim()) {
      setStatus("Udfyld brugernavn og e-mail.");
      return;
    }
    if (!email.includes("@")) {
      setStatus("E-mail ser ikke korrekt ud.");
      return;
    }

    setLoading(true);
    try {
      const eventRef = doc(db, "events", selectedEvent.id);

      await runTransaction(db, async (tx) => {
        const eventSnap = await tx.get(eventRef);
        if (!eventSnap.exists()) throw new Error("Event findes ikke længere.");

        const ev = eventSnap.data() as EventDoc;

        if (!ev.isopen) throw new Error("Eventet er lukket.");
        const max = Number(ev.maxApproved ?? 0);
        const count = Number(ev.approvedCount ?? 0);

        if (max <= 0) throw new Error("Eventet har ingen pladser sat op.");
        if (count >= max) throw new Error("Der er ikke flere pladser.");

        // Opret request-dokument i subcollection
        const reqRef = doc(collection(db, "events", selectedEvent.id, "requests"));
        tx.set(reqRef, {
          username: username.trim(),
          email: email.trim().toLowerCase(),
          createdAt: serverTimestamp(),
        });

        // Øg tæller
        tx.update(eventRef, { approvedCount: count + 1 });
      });

      setStatus("✅ Tilmelding sendt!");
      setUsername("");
      setEmail("");

      // Opdatér UI counts
      setEvents((prev) =>
        prev.map((e) =>
          e.id === selectedEvent.id ? { ...e, approvedCount: e.approvedCount + 1 } : e
        )
      );
    } catch (e: any) {
      setStatus(`❌ ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: 24 },
    wrap: { width: "100%", maxWidth: 520 },
    h1: { textAlign: "center", marginBottom: 8 },
    small: { textAlign: "center", marginBottom: 24, opacity: 0.7 },
    card: {
      border: "1px solid #ddd",
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      background: "#fff",
    },
    btn: {
      width: "100%",
      padding: "12px 14px",
      borderRadius: 10,
      border: "1px solid #111",
      background: "#111",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 600,
    },
    btn2: {
      width: "100%",
      padding: "12px 14px",
      borderRadius: 10,
      border: "1px solid #ddd",
      background: "#fff",
      cursor: "pointer",
      fontWeight: 600,
      marginTop: 10,
    },
    input: {
      width: "100%",
      padding: "12px 12px",
      borderRadius: 10,
      border: "1px solid #ddd",
      marginTop: 10,
      fontSize: 14,
    },
    row: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" },
    pill: {
      fontSize: 12,
      padding: "4px 8px",
      borderRadius: 999,
      border: "1px solid #ddd",
      opacity: 0.9,
      whiteSpace: "nowrap",
    },
    status: { marginTop: 12, textAlign: "center", fontWeight: 600 },
  };

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <h1 style={styles.h1}>Saunagus – tilmelding</h1>
        <div style={styles.small}>Vælg et åbent event og tilmeld med e-mail.</div>

        <div style={styles.card}>
          {events.length === 0 ? (
            <div>Ingen åbne events lige nu.</div>
          ) : (
            events.map((e) => {
              const remaining = Math.max(0, (e.maxApproved ?? 0) - (e.approvedCount ?? 0));
              const isSelected = e.id === selectedEventId;
              return (
                <div key={e.id} style={{ marginBottom: 12 }}>
                  <div style={styles.row}>
                    <div style={{ fontWeight: 700 }}>{e.title}</div>
                    <div style={styles.pill}>
                      Pladser: {e.approvedCount} / {e.maxApproved} (tilbage: {remaining})
                    </div>
                  </div>
                  <button
                    style={{ ...styles.btn, marginTop: 10, opacity: isSelected ? 0.85 : 1 }}
                    onClick={() => setSelectedEventId(e.id)}
                    type="button"
                  >
                    {isSelected ? "Valgt" : "Vælg dette event"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={styles.card}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Tilmeld dig</div>
          <input
            style={styles.input}
            placeholder="Brugernavn"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button style={{ ...styles.btn, marginTop: 12, opacity: loading ? 0.6 : 1 }} onClick={submit} disabled={loading}>
            {loading ? "Sender..." : "Send tilmelding"}
          </button>

          <button
            style={styles.btn2}
            type="button"
            onClick={() => {
              setSelectedEventId(null);
              setStatus("");
              setUsername("");
              setEmail("");
            }}
          >
            Fortryd
          </button>

          {status && <div style={styles.status}>{status}</div>}
        </div>
      </div>
    </main>
  );
}
