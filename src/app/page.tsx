"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
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
};

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [rawCount, setRawCount] = useState<number>(0);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        setError("");

        const snap = await getDocs(collection(db, "events"));
        setRawCount(snap.size);

        const parsed: Event[] = snap.docs.map((doc) => {
          const d = doc.data() as EventDoc;

          return {
            id: doc.id,
            title: d.title ?? "Uden titel",
            isOpen: Boolean(d.isOpen),
            startAt: d.startAt,
          };
        });

        // Vis ALLE åbne events (uanset om de er i fremtiden)
        setEvents(parsed.filter((e) => e.isOpen));
      } catch (e: any) {
        setError(e?.message ?? "Ukendt fejl");
        setRawCount(0);
        setEvents([]);
      }
    };

    load();
  }, []);

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Saunagus – tilmelding</h1>

      <p style={{ opacity: 0.7 }}>
        Debug: hentede {rawCount} events, viser {events.length} åbne.
      </p>

      {error && (
        <p style={{ color: "crimson" }}>
          Firestore-fejl: {error}
        </p>
      )}

      <h2>Åbne events</h2>
      {events.length === 0 ? (
        <p>Ingen åbne events lige nu.</p>
      ) : (
        <ul>
          {events.map((e) => (
            <li key={e.id}>
              <strong>{e.title}</strong>
              {e.startAt ? (
                <span style={{ opacity: 0.7 }}>
                  {" "}
                  – {e.startAt.toDate().toLocaleString("da-DK")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
