"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

type Event = {
  id: string;
  title: string;
  maxApproved: number;
  approvedCount: number;
  isOpen: boolean;
  startAt?: any; // (valgfrit) Firestore timestamp
};

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadEvents = async () => {
      const snap = await getDocs(collection(db, "events"));
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Event, "id">),
      }));
      setEvents(data.filter((e) => e.isOpen));
    };

    loadEvents();
  }, []);

  const submit = async () => {
    setMessage("");

    if (!username || !email || !selectedEvent) {
      setMessage("Udfyld alle felter");
      return;
    }

    await addDoc(collection(db, "events", selectedEvent, "requests"), {
      username,
      email,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    setUsername("");
    setEmail("");
    setSelectedEvent(null);
    setMessage("Tak – din tilmelding er sendt. Du får svar på e-mail.");
  };

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.h1}>Saunagus – tilmelding</h1>

        {events.length === 0 && (
          <p style={styles.muted}>Ingen åbne events lige nu.</p>
        )}

        <div style={styles.list}>
          {events.map((e) => {
            const isFull = (e.approvedCount ?? 0) >= (e.maxApproved ?? 5);

            return (
              <div key={e.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <h3 style={styles.h3}>{e.title}</h3>

                  {e.startAt?.seconds && (
                    <p style={styles.date}>
                      {new Date(e.startAt.seconds * 1000).toLocaleString("da-DK", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}

                  <p style={styles.muted}>
                    Par: <b>{e.approvedCount ?? 0}</b> / <b>{e.maxApproved ?? 5}</b>{" "}
                    <span style={{ opacity: 0.8 }}>
                      (personer: {(e.approvedCount ?? 0) * 2} / {(e.maxApproved ?? 5) * 2})
                    </span>
                  </p>
                </div>

                <button
                  style={{
                    ...styles.primaryBtn,
                    opacity: isFull ? 0.5 : 1,
                    cursor: isFull ? "not-allowed" : "pointer",
                  }}
                  disabled={isFull}
                  onClick={() => !isFull && setSelectedEvent(e.id)}
                >
                  {isFull ? "Fuldt booket" : "Vælg dette event"}
                </button>
              </div>
            );
          })}
        </div>

        {selectedEvent && (
          <section style={styles.section}>
            <h2 style={styles.h2}>Tilmeld dig</h2>

            <label style={styles.label}>Navn</label>
            <input
              style={styles.input}
              placeholder="Fx Thomas"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <label style={styles.label}>E-mail</label>
            <input
              style={styles.input}
              type="email"
              placeholder="fx navn@email.dk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button style={styles.primaryBtn} onClick={submit}>
              Send tilmelding
            </button>

            <button
              style={styles.secondaryBtn}
              onClick={() => {
                setSelectedEvent(null);
                setMessage("");
              }}
            >
              Fortryd
            </button>
          </section>
        )}

        {message && <p style={styles.message}>{message}</p>}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 16,
  },
  container: {
    maxWidth: 520,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  h1: { fontSize: 28, margin: 0 },
  h2: { fontSize: 20, margin: "8px 0 0" },
  h3: { fontSize: 16, margin: 0 },
  muted: { margin: 0, opacity: 0.75 },
  date: { margin: 0, fontSize: 14, opacity: 0.85 },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  card: {
    border: "1px solid #e5e5e5",
    borderRadius: 10,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  cardTop: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  section: {
    border: "1px solid #e5e5e5",
    borderRadius: 10,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: { fontSize: 12, opacity: 0.8 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ccc",
    fontSize: 16,
  },
  primaryBtn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #000",
    background: "#000",
    color: "#fff",
    fontSize: 16,
  },
  secondaryBtn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ccc",
    background: "#fff",
    fontSize: 16,
  },
  message: {
    margin: 0,
    padding: 10,
    borderRadius: 8,
    background: "#f5f5f5",
  },
};
