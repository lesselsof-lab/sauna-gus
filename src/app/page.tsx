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
  const [rawCount, setRawCount] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadEvents = async () => {
      setError("");

      try {
        const snap = await getDocs(collection(db, "events"));
        setRawCount(snap.size);

        const parsed: Event[] = snap.docs.map((doc) => {
          const d: any = doc.data();

          const isOpenValue = d.isOpen ?? d.isopen ?? d.is_open ?? false;

          return {
            id: doc.id,
            title: d.title ?? "Uden titel",
            maxApproved: Number(d.maxApproved ?? d.maxapproved ?? 0),
            approvedCount: Number(d.approvedCount ?? d.approvedcount ?? 0),
            isOpen: isOpenValue === true || isOpenValue === "true" || isOpenValue === 1,
          };
        });

        const openEvents = parsed.filter((e) => e.isOpen);
        setEvents(openEvents);

        // Log til browser console (F12)
        console.log("events snap.size =", snap.size);
        console.log("parsed =", parsed);
        console.log("openEvents =", openEvents);
      } catch (e: any) {
        console.error(e);
        setError(String(e?.message ?? e));
      }
    };

    loadEvents();
  }, []);

  const submit = async () => {
    setMessage("");

    if (!username || !email || !selectedEvent) {
      setMessage("Udfyld alle felter");
      return;
    }

    try {
      await addDoc(collection(db, "events", selectedEvent, "requests"), {
        username,
        email,
        createdAt: serverTimestamp(),
      });
      setUsername("");
      setEmail("");
      setMessage("Tilmelding sendt ✅");
    } catch (e: any) {
      console.error(e);
      setMessage("Fejl ved tilmelding: " + String(e?.message ?? e));
    }
  };

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Saunagus – tilmelding</h1>

      <div style={{ padding: 12, border: "1px solid #ddd", marginBottom: 16 }}>
        <div><b>DEBUG</b></div>
        <div>Docs i <code>events</code>: {rawCount === null ? "…" : rawCount}</div>
        {error && (
          <div style={{ marginTop: 8 }}>
            <b>FEJL:</b> <code>{error}</code>
          </div>
        )}
      </div>

      {events.length === 0 && <p>Ingen åbne events lige nu.</p>}

      {events.map((e) => (
        <div key={e.id} style={{ border: "1px solid #ddd", padding: 16, marginBottom: 12 }}>
          <strong>{e.title}</strong>
          <div>
            Pladser: {e.approvedCount} / {e.maxApproved}
          </div>
          <button onClick={() => setSelectedEvent(e.id)}>Vælg dette event</button>
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
