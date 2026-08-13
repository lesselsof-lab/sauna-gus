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
  const [phone, setPhone] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadEvents = async () => {
    try {
      const snap = await getDocs(
        collection(db, "events")
      );

      const parsed: Event[] = snap.docs.map((doc) => {
        const d = doc.data() as EventDoc;

        return {
          id: doc.id,
          title: d.title ?? "Uden titel",
          isOpen: Boolean(d.isOpen),
          startAt: d.startAt,
          maxApproved: d.maxApproved ?? 0,
          approvedCount: d.approvedCount ?? 0,
        };
      });

      const openEvents = parsed.filter(
        (event) => event.isOpen
      );

      setEvents(openEvents);

      if (
        openEvents.length > 0 &&
        !openEvents.some(
          (event) => event.id === selectedEvent
        )
      ) {
        setSelectedEvent(openEvents[0].id);
      }
    } catch (e: any) {
      setError(
        e?.message ??
          "Kunne ikke hente events."
      );
    }
  };

  useEffect(() => {
    loadEvents();

    // Opdater pladstal automatisk hvert 5. sekund
    const interval = setInterval(() => {
      loadEvents();
    }, 5000);

    return () => clearInterval(interval);
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

    if (!phone.trim()) {
      setError("Indtast dit telefonnummer.");
      return;
    }

    const event = events.find(
      (e) => e.id === selectedEvent
    );

    if (!event) {
      setError(
        "Det valgte event blev ikke fundet."
      );
      return;
    }

    const approvedCount =
      event.approvedCount ?? 0;

    const maxApproved =
      event.maxApproved ?? 0;

    if (
      maxApproved > 0 &&
      approvedCount >= maxApproved
    ) {
      setError(
        "Eventet er fuldt booket."
      );
      return;
    }

    try {
      await addDoc(
        collection(db, "registrations"),
        {
          eventId: event.id,
          eventTitle: event.title,
          username: username.trim(),
          phone: phone.trim(),
          status: "pending",
          createdAt: new Date(),
        }
      );

      setMessage(
        "Tak! Din tilmelding er modtaget og afventer godkendelse."
      );

      setUsername("");
      setPhone("");

      await loadEvents();
    } catch (e: any) {
      setError(
        e?.message ??
          "Tilmeldingen kunne ikke sendes."
      );
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
        <p
          style={{
            color: "crimson",
            fontWeight: "bold",
          }}
        >
          {error}
        </p>
      )}

      {message && (
        <p
          style={{
            color: "green",
            fontWeight: "bold",
          }}
        >
          {message}
        </p>
      )}

      <h2>Åbne events</h2>

      {events.length === 0 ? (
        <p>
          Ingen åbne events lige nu.
        </p>
      ) : (
        <>
          {events.map((event) => {
            const approved =
              event.approvedCount ?? 0;

            const max =
              event.maxApproved ?? 0;

            const full =
              max > 0 &&
              approved >= max;

            return (
              <div
                key={event.id}
                style={{
                  border: "1px solid #ddd",
                  padding: 15,
                  marginBottom: 10,
                  borderRadius: 8,
                }}
              >
                <strong>
                  {event.title}
                </strong>

                {event.startAt && (
                  <div>
                    {event.startAt
                      .toDate()
                      .toLocaleString(
                        "da-DK"
                      )}
                  </div>
                )}

                <div
                  style={{
                    marginTop: 8,
                    fontWeight: "bold",
                  }}
                >
                  Pladser: {approved} / {max}
                </div>

                {full && (
                  <div
                    style={{
                      marginTop: 5,
                      color: "crimson",
                      fontWeight: "bold",
                    }}
                  >
                    FULDT BOOKET
                  </div>
                )}
              </div>
            );
          })}

          <h2>Tilmeld dig</h2>

          <select
            value={selectedEvent}
            onChange={(e) =>
              setSelectedEvent(
                e.target.value
              )
            }
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 10,
            }}
          >
            {events.map((event) => {
              const full =
                (event.maxApproved ?? 0) > 0 &&
                (event.approvedCount ?? 0) >=
                  (event.maxApproved ?? 0);

              return (
                <option
                  key={event.id}
                  value={event.id}
                  disabled={full}
                >
                  {event.title}
                  {full
                    ? " – FULDT BOOKET"
                    : ""}
                </option>
              );
            })}
          </select>

          <input
            type="text"
            placeholder="Brugernavn"
            value={username}
            onChange={(e) =>
              setUsername(e.target.value)
            }
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 10,
              boxSizing: "border-box",
            }}
          />

          <input
            type="tel"
            placeholder="Telefonnummer"
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value)
            }
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 10,
              boxSizing: "border-box",
            }}
          />

          {(() => {
            const selected =
              events.find(
                (event) =>
                  event.id === selectedEvent
              );

            const full =
              selected &&
              (selected.maxApproved ?? 0) > 0 &&
              (selected.approvedCount ?? 0) >=
                (selected.maxApproved ?? 0);

            return (
              <button
                onClick={submitRegistration}
                disabled={Boolean(full)}
                style={{
                  padding: "10px 20px",
                  cursor: full
                    ? "not-allowed"
                    : "pointer",
                  opacity: full ? 0.5 : 1,
                }}
              >
                {full
                  ? "Fuldt booket"
                  : "Send tilmelding"}
              </button>
            );
          })()}
        </>
      )}
    </main>
  );
}
