"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

type EventDoc = {
  id: string;
  title: string;
  isOpen: boolean;
  startAt: Date | null;
  maxApproved: number;
  approvedCount: number;
};

function toNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v: any) {
  return v === true;
}

function toDate(v: any): Date | null {
  // Firestore Timestamp
  if (v instanceof Timestamp) return v.toDate();
  // Sometimes SDK returns { seconds, nanoseconds }
  if (v && typeof v === "object" && typeof v.seconds === "number") {
    return new Timestamp(v.seconds, v.nanoseconds ?? 0).toDate();
  }
  return null;
}

function formatDate(d: Date | null) {
  if (!d) return "Ukendt tidspunkt";
  return d.toLocaleString("da-DK", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomePage() {
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [rawCount, setRawCount] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  // Hent events
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const snap = await getDocs(collection(db, "events"));
        setRawCount(snap.size);

        const parsed: EventDoc[] = snap.docs.map((d) => {
          const data: any = d.data();
          return {
            id: d.id,
            title: (data?.title ?? "Uden titel") as string,
            isOpen: toBool(data?.isOpen),
            startAt: toDate(data?.startAt),
            maxApproved: toNumber(data?.maxApproved, 0),
            approvedCount: toNumber(data?.approvedCount, 0),
          };
        });

        // Vis kun isOpen=true (både nu + kommende)
        setEvents(parsed.filter((e) => e.isOpen));
      } catch (e: any) {
        setError(e?.message ?? "Kunne ikke hente events.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const now = useMemo(() => new Date(), []);

  const openNow = useMemo(() => {
    return [...events]
      .filter((e) => e.startAt && e.startAt <= now)
      .sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0));
  }, [events, now]);

  const upcoming = useMemo(() => {
    return [...events]
      .filter((e) => e.startAt && e.startAt > now)
      .sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0));
  }, [events, now]);

  const selected = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  async function submit() {
    setMessage("");

    const name = username.trim();
    const mail = email.trim();

    if (!selectedEventId) {
      setMessage("Vælg et event først.");
      return;
    }
    if (!name || !mail) {
      setMessage("Udfyld brugernavn og e-mail.");
      return;
    }
    if (!mail.includes("@")) {
      setMessage("E-mail ser forkert ud.");
      return;
    }

    try {
      const eventRef = doc(db, "events", selectedEventId);

      await runTransaction(db, async (tx) => {
        const eventSnap = await tx.get(eventRef);
        if (!eventSnap.exists()) throw new Error("Event findes ikke længere.");

        const data: any = eventSnap.data();

        const isOpen = toBool(data?.isOpen);
        const maxApproved = toNumber(data?.maxApproved, 0);
        const approvedCount = toNumber(data?.approvedCount, 0);

        if (!isOpen) throw new Error("Eventet er lukket.");
        if (maxApproved > 0 && approvedCount >= maxApproved) {
          throw new Error("Der er desværre ikke flere pladser.");
        }

        // Opret request i subcollection
        const reqRef = doc(collection(db, "events", selectedEventId, "requests"));
        tx.set(reqRef, {
          username: name,
          email: mail,
          createdAt: serverTimestamp(),
          status: "pending",
        });

        // Increment approvedCount (reserver plads)
        tx.update(eventRef, {
          approvedCount: approvedCount + 1,
        });
      });

      setUsername("");
      setEmail("");
      setMessage("✅ Tilmelding sendt!");
    } catch (e: any) {
      setMessage(e?.message ?? "Noget gik galt ved tilmelding.");
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui, Arial" }}>
      <h1 style={{ textAlign: "center", marginBottom: 6 }}>Saunagus – tilmelding</h1>
      <p style={{ textAlign: "center", marginTop: 0, opacity: 0.8 }}>
        Viser åbne events (både nu og kommende). Tilmeld med e-mail.
      </p>

      {error ? (
        <div style={{ border: "1px solid #f99", padding: 12, borderRadius: 10, marginTop: 14 }}>
          <b>Fejl:</b> {error}
        </div>
      ) : null}

      <div style={{ marginTop: 14, opacity: 0.75, fontSize: 13 }}>
        Debug: hentede {rawCount ?? "…"} events, viser {events.length} åbne.
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
        {/* Åbne nu */}
        <section style={{ border: "1px solid #ddd", borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Åbne lige nu</h2>
          {loading ? (
            <div>Indlæser…</div>
          ) : openNow.length === 0 ? (
            <div>Ingen åbne events lige nu.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {openNow.map((e) => (
                <div
                  key={e.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    background: selectedEventId === e.id ? "#f7f7f7" : "white",
                  }}
                >
                  <b>{e.title}</b>
                  <div style={{ opacity: 0.8, marginTop: 4 }}>{formatDate(e.startAt)}</div>
                  <div style={{ marginTop: 6 }}>
                    Pladser: {e.approvedCount} / {e.maxApproved || "?"}
                  </div>
                  <button
                    onClick={() => setSelectedEventId(e.id)}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#111",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    Vælg dette event
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Kommende */}
        <section style={{ border: "1px solid #ddd", borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Kommende åbne events</h2>
          {loading ? (
            <div>Indlæser…</div>
          ) : upcoming.length === 0 ? (
            <div>Ingen kommende åbne events.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {upcoming.map((e) => (
                <div
                  key={e.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    background: selectedEventId === e.id ? "#f7f7f7" : "white",
                  }}
                >
                  <b>{e.title}</b>
                  <div style={{ opacity: 0.8, marginTop: 4 }}>{formatDate(e.startAt)}</div>
                  <div style={{ marginTop: 6 }}>
                    Pladser: {e.approvedCount} / {e.maxApproved || "?"}
                  </div>
                  <button
                    onClick={() => setSelectedEventId(e.id)}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#111",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    Vælg dette event
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tilmeld */}
        <section style={{ border: "1px solid #ddd", borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Tilmeld dig</h2>

          <div style={{ marginBottom: 10, opacity: 0.85 }}>
            Valgt event: <b>{selected ? selected.title : "Ingen"}</b>
          </div>

          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Brugernavn"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd", marginBottom: 10 }}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd", marginBottom: 10 }}
          />

          <button
            onClick={submit}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "white",
              cursor: "pointer",
            }}
          >
            Send tilmelding
          </button>

          <button
            onClick={() => {
              setSelectedEventId(null);
              setMessage("");
            }}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              marginTop: 10,
            }}
          >
            Fortryd
          </button>

          {message ? (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "#f6f6f6" }}>
              {message}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
