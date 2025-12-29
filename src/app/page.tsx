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
};

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
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

    if (!username || !phone || !selectedEvent) {
      setMessage("Udfyld alle felter");
      return;
    }

    await addDoc(collection(db, "events", selectedEvent, "requests"), {
      username,
      phone,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    setUsername("");
    setPhone("");
    setSelectedEvent(null);
    setMessage("Tak – din tilmelding er sendt");
  };

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.h1}>Saunagus – tilmelding</h1>

        {events.length === 0 && (
          <p style={styles.muted}>Ingen åbne events lige nu.</p>
        )}

        {events.map((e) => {
          const isFull = e.approvedCount >= e.maxApproved;

          return (
            <div key={e.id} style={styles.card}>
              <h3 style={styles.h3}>{e.title}</h3>

              <p style={styles.muted}>
                Pladser: <b>{e.approvedCount}</b> / <b>{e.maxApproved}</b>
              </p>

              <button
                style={{
                  ...styles.primaryBtn,
                  opacity: isFull ? 0.5 : 1,
                }}
                disabled={isFull}
                onClick={() => setSelectedEvent(e.id)}
              >
                {isFull ? "Fuldt booket" : "Vælg dette event"}
              </button>
            </div>
          );
        })}

        {selectedEvent && (
          <div style={styles.card}>
            <h2 style={styles.h2}>Tilmeld dig</h2>

            <input
              style={styles.input}
              placeholder="Brugernavn"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Telefonnummer"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
            />

            <button style={styles.primaryBtn} onClick={submit}>
              Send tilmelding
            </button>

            <button
              style={styles.secondaryBtn}
              onClick={() => setSelectedEvent(null)}
            >
              Fortryd
            </button>
          </div>
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
    maxWidth: 480,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  h1: { fontSize: 26, margin: 0 },
  h2: { fontSize: 20, margin: 0 },
  h3: { fontSize: 16, margin: 0 },
  muted: { opacity: 0.7 },
  card: {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  input: {
    padding: "10px 12px",
    fontSize: 16,
    borderRadius: 8,
    border: "1px solid #ccc",
  },
  primaryBtn: {
    padding: "10px",
    fontSize: 16,
    borderRadius: 8,
    border: "none",
    background: "#000",
    color: "#fff",
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px",
    fontSize: 16,
    borderRadius: 8,
    border: "1px solid #ccc",
    background: "#fff",
  },
  message: {
    padding: 10,
    background: "#f2f2f2",
    borderRadius: 8,
  },
};
