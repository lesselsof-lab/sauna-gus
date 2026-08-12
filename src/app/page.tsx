"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

type EventDoc = {
  title?: string;
  isOpen?: boolean;
  startAt?: Timestamp;
  maxApproved?: number;
  approvedCount?: number;
};

type Event = {
  id: string;
  title: string;
  isOpen: boolean;
  startAt?: Timestamp;
  maxApproved?: number;
  approvedCount?: number;
};

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, "events"));

        const parsed: Event[] = snap.docs.map((doc) => {
          const d = doc.data() as EventDoc;

          return {
            id: doc.id,
            title: d.title ?? "Uden titel",
            isOpen: Boolean(d.isOpen),
            startAt: d.startAt,
            maxApproved: d.maxApproved,
            approvedCount: d.approvedCount ?? 0,
          };
        });

        const openEvents = parsed.filter((e) => e.isOpen);
        setEvents(openEvents);

        if (openEvents.length > 0) {
          setSelectedEvent(openEvents[0].id);
        }
      } catch (e: any) {
        setError(e?.message ?? "Kunne ikke hente events");
      }
    };

    load();
  }, []);

  const submitRegistration = async () => {
    setMessage("");
    setError("");

    if (!selectedEvent) {
      setError("Vælg et event.");
      return;
    }

    if (!username.trim()) {
      setError("Indtast dit brugernavn.");
      return;
    }

    if (!email.trim()) {
      setError("Indtast din e-mail.");
      return;
    }

    const event = events.find((e) => e.id === selectedEvent);

    if (!event) {
      setError("Det valgte event blev ikke fundet.");
      return;
    }

    try {
      await addDoc(collection(db, "registrations"), {
        eventId: event.id,
        eventTitle: event.title,
        username: username.trim(),
        email: email.trim(),
        status: "pending",
        createdAt: new Date(),
      });

      setMessage(
        "Tak! Din tilmelding er modtaget og afventer godkendelse."
      );

      setUsername("");
      setEmail("");
    } catch (e: any) {
      setError(e?.message ?? "Tilmeldingen kunne ikke sendes.");
    }
  };

  return (
    <main
      style={{
        maxWidth: 700,
        margin: "40px auto",
        padding: "0 20px",
        fontFamily: "system-ui",
      }}
    >
      <h1>Saunagus – tilmelding</h1>

      {error && (
        <p style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      {message && (
        <p style={{ color: "green", fontWeight: "bold" }}>
          {message}
        </p>
      )}

      <h2>Åbne events</h2>

      {events.length === 0 ? (
        <p>Ingen åbne events lige nu.</p>
      ) : (
        <>
          {events.map((event) => (
            <div
              key={event.id}
              style={{
                border: "1px solid #ddd",
                padding: 15,
                marginBottom: 10,
                borderRadius: 8,
              }}
            >
              <strong>{event.title}</strong>

              {event.startAt && (
                <div>
                  {event.startAt.toDate().toLocaleString("da-DK")}
                </div>
              )}

              <div>
                Pladser: {event.approvedCount ?? 0} /{" "}
                {event.maxApproved ?? 0}
              </div>
            </div>
          ))}

          <h2>Tilmeld dig</h2>

          <select
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 10,
            }}
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Brugernavn"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 10,
              boxSizing: "border-box",
            }}
          />

          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 10,
              boxSizing: "border-box",
            }}
          />

          <button
            onClick={submitRegistration}
            style={{
              padding: "10px 20px",
              cursor: "pointer",
            }}
          >
            Send tilmelding
          </button>
        </>
      )}
    </main>
  );
}
