"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

type Event = {
  id: string;
  title: string;
  isOpen: boolean;
  startAt: Timestamp;
};

export default function HomePage() {
  const [openNow, setOpenNow] = useState<Event[]>([]);
  const [upcoming, setUpcoming] = useState<Event[]>([]);

  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "events"));
      const now = new Date();

      const parsed = snap.docs.map(doc => {
        const d: any = doc.data();
        return {
          id: doc.id,
          title: d.title ?? "Uden titel",
          isOpen: Boolean(d.isOpen),
          startAt: d.startAt
        };
      });

      setOpenNow(
        parsed.filter(e =>
          e.isOpen && e.startAt.toDate() <= now
        )
      );

      setUpcoming(
        parsed.filter(e =>
          e.isOpen && e.startAt.toDate() > now
        )
      );
    };

    load();
  }, []);

  return (
    <main>
      <h1>Saunagus – tilmelding</h1>

      <h2>Åbne lige nu</h2>
      {openNow.length === 0 && <p>Ingen åbne events lige nu.</p>}
      {openNow.map(e => (
        <div key={e.id}>{e.title}</div>
      ))}

      <h2>Kommende åbne events</h2>
      {upcoming.length === 0 && <p>Ingen kommende åbne events.</p>}
      {upcoming.map(e => (
        <div key={e.id}>{e.title}</div>
      ))}
    </main>
  );
}
