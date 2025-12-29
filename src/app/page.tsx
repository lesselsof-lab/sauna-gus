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
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadEvents = async () => {
      const snap = await getDocs(collection(db, "events"));

      const parsed: Event[] = snap.docs.map((doc) => {
        const d: any = doc.data();

        return {
          id: doc.id,
          title: d.title ?? "Uden titel",
          maxApproved: Number(d.maxApproved ?? d.maxapproved ?? 0),
          approvedCount: Number(d.approvedCount ?? d.approvedcount ?? 0),
          isOpen: Boolean(d.isOpen ?? d.isopen ?? false),
        };
      });

      setEvents(parsed.filter((e) => e.isOpen));
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
      createdAt: serverTimestamp(),
    });

    setUsername("");
    setEmail("");
    setMessage("Tilmelding sendt ✅");
  };

  return (
    <main style={{ maxWidth: 500, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Saunagus – tilmelding</h1>

      {events.length === 0 && (
        <p>Ingen åbne events lige nu.</p>
      )}

      {events.map((e) => (
        <div key={e.id} style={{ border: "1px solid #ddd", padding: 16, marginBottom: 12 }}>
          <strong>{e.title}</strong>
          <div>
            Pladser: {e.approvedCount} / {e.maxApproved}
          </div>
          <button onClick={() => setSelectedEvent(e.id)}>
            Vælg dette event
          </button>
        </div>
      ))}

      <h2>Tilmeld dig</h2>

      <input
        placeholder="Brugernavn"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />

      <input
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />

      <button onClick={submit} style={{ width: "100%", padding: 10 }}>
        Send tilmelding
      </button>

      {message && <p>{message}</p>}
    </main>
  );
}
