"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Event = {
  id: string;
  title: string;
  approvedCount: number;
  maxApproved: number;
  isOpen: boolean;
};

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
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
          approvedCount: Number(d.approvedCount ?? 0),
          maxApproved: Number(d.maxApproved ?? 0),
          isOpen: Boolean(d.isOpen),
        };
      });

      setEvents(parsed.filter((e) => e.isOpen));
    };

    loadEvents();
  }, []);

  const submit = async () => {
    setMessage("");

    if (!username || !email || !selectedEvent) {
      setMessage("Udfyld alle felter og vælg et event");
      return;
    }

    try {
      await addDoc(
        collection(db, "events", selectedEvent.id, "requests"),
        {
          username,
          email,
          createdAt: serverTimestamp(),
        }
      );

      setMessage("Tilmelding modtaget ✅");
      setUsername("");
      setEmail("");
    } catch (err) {
      setMessage("Noget gik galt ❌");
    }
  };

  return (
    <main style={{ maxWidth: 500, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Saunagus – tilmelding</h1>

      {events.length === 0 && <p>Ingen åbne events lige nu.</p>}

      {events.map((e) => (
        <div key={e.id} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 10 }}>
          <strong>{e.title}</strong>
          <div>
            Pladser: {e.approvedCount} / {e.maxApproved}
          </div>
          <button onClick={() => setSelectedEvent(e)}>Vælg dette event</button>
        </div>
      ))}

      <hr />

      <h2>Tilmeld dig</h2>
      <p>Valgt event: {selectedEvent?.title ?? "Ingen"}</p>

      <input
        placeholder="Brugernavn"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <br />
      <input
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <br />

      <button onClick={submit}>Send tilmelding</button>

      {message && <p>{message}</p>}
    </main>
  );
}
