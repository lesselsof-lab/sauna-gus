"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";

// ✅ VIGTIGT: RELATIV IMPORT (IKKE @/...)
import { db } from "../lib/firebase";

type Event = {
  id: string;
  title: string;
  maxApproved: number;
  approvedCount: number;
  isOpen: boolean;
  startAt?: any;
};

export default function HomePage() {
  const [openNow, setOpenNow] = useState<Event[]>([]);
  const [openUpcoming, setOpenUpcoming] = useState<Event[]>([]);
  const [rawCount, setRawCount] = useState<number>(0);

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    const loadEvents = async () => {
      setError("");
      setMessage("");

      try {
        const snap = await getDocs(collection(db, "events"));
        setRawCount(snap.size);

        const parsed: Event[] = snap.docs.map((doc) => {
          const d: any = doc.data();
          return {
            id: doc.id,
            title: d.title ?? "Uden titel",
            maxApproved: Number(d.maxApproved ?? 0),
            approvedCount: Number(d.approvedCount ?? 0),
            isOpen: Boolean(d.isOpen ?? d.isopen ?? false), // understøtter begge feltnavne
            startAt: d.startAt,
          };
        });

        const onlyOpen = parsed.filter((e) => e.isOpen);

        const nowOpen: Event[] = [];
        const upcoming: Event[] = [];

        for (const e of onlyOpen) {
          const start =
            e.startAt?.toDate?.() instanceof Date ? e.startAt.toDate() : null;

          // Hvis du ikke har startAt på eventet, så vis den som "åben nu"
          if (!start) {
            nowOpen.push(e);
            continue;
          }

          if (start <= now) nowOpen.push(e);
          else upcoming.push(e);
        }

        // sortering (valgfrit)
        upcoming.sort((a, b) => {
          const da = a.startAt?.toDate?.() ?? new Date(0);
          const dbb = b.startAt?.toDate?.() ?? new Date(0);
          return da.getTime() - dbb.getTime();
        });

        setOpenNow(nowOpen);
        setOpenUpcoming(upcoming);

        // vælg automatisk første hvis ingen valgt
        if (!selectedEvent && (nowOpen[0] || upcoming[0])) {
          setSelectedEvent(nowOpen[0] ?? upcoming[0]);
        }
      } catch (err: any) {
        setError(err?.message ?? String(err));
        setOpenNow([]);
        setOpenUpcoming([]);
      }
    };

    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setMessage("");
    setError("");

    if (!selectedEvent) {
      setError("Vælg et event først.");
      return;
    }
    if (!username.trim() || !email.trim()) {
      setError("Udfyld brugernavn og e-mail.");
      return;
    }

    try {
      // skriver under: events/{eventId}/requests
      await addDoc(collection(db, "events", selectedEvent.id, "requests"), {
        username: username.trim(),
        email: email.trim(),
        createdAt: serverTimestamp(),
      });

      setMessage("Tilmelding sendt ✅");
      setUsername("");
      setEmail("");
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  };

  const cancel = () => {
    setSelectedEvent(null);
    setMessage("");
    setError("");
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.h1}>Saunagus – tilmelding</h1>
        <p className={styles.p}>
          Viser åbne events (både nu og kommende). Tilmeld med e-mail.
        </p>

        <p className={styles.debug}>
          Debug: hentede {rawCount} events, viser {openNow.length + openUpcoming.length} åbne.
        </p>

        {error && <div className={styles.errorBox}>{error}</div>}
        {message && <div className={styles.okBox}>{message}</div>}

        <div className={styles.card}>
          <h2 className={styles.h2}>Åbne lige nu</h2>
          {openNow.length === 0 ? (
            <div className={styles.muted}>Ingen åbne events lige nu.</div>
          ) : (
            openNow.map((e) => (
              <div key={e.id} className={styles.eventRow}>
                <div>
                  <div className={styles.eventTitle}>{e.title}</div>
                  <div className={styles.muted}>
                    Pladser: {e.approvedCount} / {e.maxApproved}
                  </div>
                </div>
                <button
                  className={styles.primaryBtn}
                  onClick={() => setSelectedEvent(e)}
                >
                  Vælg dette event
                </button>
              </div>
            ))
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.h2}>Kommende åbne events</h2>
          {openUpcoming.length === 0 ? (
            <div className={styles.muted}>Ingen kommende åbne events.</div>
          ) : (
            openUpcoming.map((e) => {
              const start =
                e.startAt?.toDate?.() instanceof Date ? e.startAt.toDate() : null;
              return (
                <div key={e.id} className={styles.eventRow}>
                  <div>
                    <div className={styles.eventTitle}>{e.title}</div>
                    <div className={styles.muted}>
                      {start ? start.toLocaleString("da-DK") : ""}
                      {" · "}
                      Pladser: {e.approvedCount} / {e.maxApproved}
                    </div>
                  </div>
                  <button
                    className={styles.primaryBtn}
                    onClick={() => setSelectedEvent(e)}
                  >
                    Vælg dette event
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.h2}>Tilmeld dig</h2>
          <div className={styles.muted}>
            Valgt event: <b>{selectedEvent ? selectedEvent.title : "Ingen"}</b>
          </div>

          <input
            className={styles.input}
            placeholder="Brugernavn"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className={styles.input}
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button className={styles.primaryBtn} onClick={submit}>
            Send tilmelding
          </button>
          <button className={styles.secondaryBtn} onClick={cancel}>
            Fortryd
          </button>
        </div>
      </div>
    </main>
  );
}
