"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./lib/firebase";

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
    setMessage("Tak – din tilmelding er sendt");
  };

  return (
    <main style={{ padding: 16 }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1>Saunagus – tilmelding</h1>

        {events.map((e) => (
          <div
            key={e.id}
            style={{
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <h3>{e.title}</h3>
            <p>
              Pladser: {e.approvedCount} / {e.maxApproved}
            </p>
            <button onClick={() => setSelectedEvent(e.id)}>
              Vælg dette event
            </button>
          </div>
        ))}

        {selectedEvent && (
          <>
            <h2>Tilmeld dig</h2>

            <input
              placeholder="Navn"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%", padding: 10, marginBottom: 8 }}
            />

            <input
              placeholder="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: 10, marginBottom: 8 }}
            />

            <button onClick={submit} style={{ width: "100%", padding: 10 }}>
              Send tilmelding
            </button>
          </>
        )}

        {message && <p>{message}</p>}
      </div>
    </main>
  );
}
