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
  maxApproved?: number;
  approvedCount?: number;
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
            maxApproved: d.maxApproved,
            approvedCount: d.approvedCount ?? 0,
          };
        });

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
    <main
      style={{
        maxWidth: 640,
        margin: "40px auto",
        padding: "0 20px",
        fontFamily: "system-ui",
      }}
    >
      <h1>Saunagus – tilmelding</h1>

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
            <li key={e.id} style={{ marginBottom: 20 }}>
              <strong>{e.title}</strong>

              {e.startAt && (
                <div style={{ opacity: 0.7 }}>
                  {e.startAt.toDate().toLocaleString("da-DK")}
                </div>
              )}

              <div>
                Pladser: {e.approvedCount ?? 0} / {e.maxApproved ?? 0}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
