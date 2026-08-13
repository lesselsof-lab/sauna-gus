"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  runTransaction,
  doc,
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
  const [selectedEvent, setSelectedEvent] =
    useState("");

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [sending, setSending] = useState(false);

  const loadEvents = async () => {
    try {
      const snap = await getDocs(
        collection(db, "events")
      );

      const parsed: Event[] = snap.docs.map(
        (eventDoc) => {
          const d =
            eventDoc.data() as EventDoc;

          return {
            id: eventDoc.id,
            title:
              d.title ?? "Uden titel",
            isOpen: Boolean(
              d.isOpen
            ),
            startAt: d.startAt,
            maxApproved:
              d.maxApproved ?? 0,
            approvedCount:
              d.approvedCount ?? 0,
          };
        }
      );

      const openEvents =
        parsed.filter(
          (event) => event.isOpen
        );

      setEvents(openEvents);

      if (
        openEvents.length > 0 &&
        !openEvents.some(
          (event) =>
            event.id ===
            selectedEvent
        )
      ) {
        setSelectedEvent(
          openEvents[0].id
        );
      }

      if (
        openEvents.length === 0
      ) {
        setSelectedEvent("");
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

    const interval =
      setInterval(() => {
        loadEvents();
      }, 5000);

    return () =>
      clearInterval(interval);
  }, []);

  const submitRegistration =
    async () => {
      if (sending) return;

      setMessage("");
      setError("");
      setSending(true);

      if (!selectedEvent) {
        setError(
          "Vælg et event."
        );
        setSending(false);
        return;
      }

      if (!username.trim()) {
        setError(
          "Indtast dit brugernavn."
        );
        setSending(false);
        return;
      }

      if (!phone.trim()) {
        setError(
          "Indtast dit telefonnummer."
        );
        setSending(false);
        return;
      }

      try {
        const eventRef = doc(
          db,
          "events",
          selectedEvent
        );

        await runTransaction(
          db,
          async (transaction) => {
            const eventSnap =
              await transaction.get(
                eventRef
              );

            if (
              !eventSnap.exists()
            ) {
              throw new Error(
                "Eventet findes ikke længere."
              );
            }

            const eventData =
              eventSnap.data() as EventDoc;

            if (!eventData.isOpen) {
              throw new Error(
                "Eventet er ikke længere åbent for tilmelding."
              );
            }

            const approvedCount =
              Number(
                eventData.approvedCount ??
                  0
              );

            const maxApproved =
              Number(
                eventData.maxApproved ??
                  0
              );

            if (
              maxApproved > 0 &&
              approvedCount >=
                maxApproved
            ) {
              throw new Error(
                "Eventet er fuldt booket."
              );
            }

            const registrationRef =
              doc(
                collection(
                  db,
                  "registrations"
                )
              );

            transaction.set(
              registrationRef,
              {
                eventId:
                  selectedEvent,

                eventTitle:
                  eventData.title ??
                  "Uden titel",

                username:
                  username.trim(),

                phone:
                  phone.trim(),

                status:
                  "pending",

                createdAt:
                  Timestamp.now(),
              }
            );
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
      } finally {
        setSending(false);
      }
    };

  return (
    <main
      style={{
        maxWidth: 700,
        margin:
          "40px auto",
        padding:
          "0 20px",
        fontFamily:
          "system-ui",
      }}
    >
      <h1>
        Saunagus –
        tilmelding
      </h1>

      {message && (
        <p
          style={{
            color: "green",
            fontWeight:
              "bold",
          }}
        >
          {message}
        </p>
      )}

      {error && (
        <p
          style={{
            color: "crimson",
            fontWeight:
              "bold",
          }}
        >
          {error}
        </p>
      )}

      <h2>
        Åbne events
      </h2>

      {events.length ===
      0 ? (
        <p>
          Ingen åbne events
          lige nu.
        </p>
      ) : (
        <>
          {events.map(
            (event) => {
              const approved =
                event.approvedCount ??
                0;

              const max =
                event.maxApproved ??
                0;

              const full =
                max > 0 &&
                approved >= max;

              return (
                <div
                  key={event.id}
                  style={{
                    border:
                      "1px solid #ddd",
                    padding: 15,
                    marginBottom:
                      10,
                    borderRadius:
                      8,
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
                      marginTop:
                        8,
                      fontWeight:
                        "bold",
                    }}
                  >
                    Pladser:{" "}
                    {approved} /{" "}
                    {max}
                  </div>

                  {full && (
                    <div
                      style={{
                        marginTop:
                          5,
                        color:
                          "crimson",
                        fontWeight:
                          "bold",
                      }}
                    >
                      FULDT BOOKET
                    </div>
                  )}
                </div>
              );
            }
          )}

          <h2>
            Tilmeld dig
          </h2>

          <select
            value={
              selectedEvent
            }
            onChange={(e) =>
              setSelectedEvent(
                e.target.value
              )
            }
            style={{
              width: "100%",
              padding: 10,
              marginBottom:
                10,
            }}
          >
            {events.map(
              (event) => {
                const full =
                  (event.maxApproved ??
                    0) >
                    0 &&
                  (event.approvedCount ??
                    0) >=
                    (event.maxApproved ??
                      0);

                return (
                  <option
                    key={
                      event.id
                    }
                    value={
                      event.id
                    }
                    disabled={
                      full
                    }
                  >
                    {event.title}
                    {full
                      ? " – FULDT BOOKET"
                      : ""}
                  </option>
                );
              }
            )}
          </select>

          <input
            type="text"
            placeholder="Brugernavn"
            value={
              username
            }
            onChange={(e) =>
              setUsername(
                e.target.value
              )
            }
            style={{
              width: "100%",
              padding: 10,
              marginBottom:
                10,
              boxSizing:
                "border-box",
            }}
          />

          <input
            type="tel"
            placeholder="Telefonnummer"
            value={phone}
            onChange={(e) =>
              setPhone(
                e.target.value
              )
            }
            style={{
              width: "100%",
              padding: 10,
              marginBottom:
                10,
              boxSizing:
                "border-box",
            }}
          />

          {(() => {
            const selected =
              events.find(
                (event) =>
                  event.id ===
                  selectedEvent
              );

            const full =
              selected &&
              (selected.maxApproved ??
                0) >
                0 &&
              (selected.approvedCount ??
                0) >=
                (selected.maxApproved ??
                  0);

            return (
              <button
                onClick={
                  submitRegistration
                }
                disabled={
                  Boolean(
                    full
                  ) ||
                  sending
                }
                style={{
                  padding:
                    "10px 20px",
                  cursor:
                    full ||
                    sending
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    full ||
                    sending
                      ? 0.5
                      : 1,
                }}
              >
                {sending
                  ? "Sender..."
                  : full
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
