"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  runTransaction,
  doc,
  Timestamp,
  query,
  where,
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
  maxApproved: number;
  approvedCount: number;
};

type Registration = {
  id: string;
  eventId: string;
  eventTitle: string;
  username: string;
  phone: string;
  status: "pending" | "approved" | "rejected";
};

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] =
    useState("");

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");

  const [cancelPhone, setCancelPhone] =
    useState("");
  const [cancelEvent, setCancelEvent] =
    useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [sending, setSending] =
    useState(false);

  const [cancelling, setCancelling] =
    useState(false);

  const loadEvents = async () => {
    try {
      const snap = await getDocs(
        collection(db, "events")
      );

      const parsed: Event[] = snap.docs
        .map((eventDoc) => {
          const d =
            eventDoc.data() as EventDoc;

          return {
            id: eventDoc.id,
            title:
              d.title ?? "Uden titel",
            isOpen: Boolean(d.isOpen),
            startAt: d.startAt,
            maxApproved: Number(
              d.maxApproved ?? 0
            ),
            approvedCount: Number(
              d.approvedCount ?? 0
            ),
          };
        })
        .sort((a, b) => {
          const aTime =
            a.startAt?.toMillis() ?? 0;

          const bTime =
            b.startAt?.toMillis() ?? 0;

          return aTime - bTime;
        });

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
      setInterval(
        loadEvents,
        5000
      );

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
        const eventRef =
          doc(
            db,
            "events",
            selectedEvent
          );

        await runTransaction(
          db,
          async (
            transaction
          ) => {
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

            if (
              !eventData.isOpen
            ) {
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

  const cancelRegistration =
    async () => {
      if (cancelling) return;

      setMessage("");
      setError("");
      setCancelling(true);

      if (!cancelEvent) {
        setError(
          "Vælg det event, du vil afmelde."
        );
        setCancelling(false);
        return;
      }

      if (!cancelPhone.trim()) {
        setError(
          "Indtast dit telefonnummer."
        );
        setCancelling(false);
        return;
      }

      try {
        const registrationsQuery =
          query(
            collection(
              db,
              "registrations"
            ),
            where(
              "eventId",
              "==",
              cancelEvent
            ),
            where(
              "phone",
              "==",
              cancelPhone.trim()
            )
          );

        const snap =
          await getDocs(
            registrationsQuery
          );

        if (snap.empty) {
          throw new Error(
            "Vi kunne ikke finde en tilmelding med dette telefonnummer på det valgte event."
          );
        }

        if (snap.docs.length > 1) {
          throw new Error(
            "Der blev fundet flere tilmeldinger. Kontakt os for hjælp til afmelding."
          );
        }

        const registrationDoc =
          snap.docs[0];

        const registration =
          registrationDoc.data() as Registration;

        const registrationRef =
          doc(
            db,
            "registrations",
            registrationDoc.id
          );

        if (
          registration.status ===
          "approved"
        ) {
          const eventRef =
            doc(
              db,
              "events",
              cancelEvent
            );

          await runTransaction(
            db,
            async (
              transaction
            ) => {
              const eventSnap =
                await transaction.get(
                  eventRef
                );

              const registrationSnap =
                await transaction.get(
                  registrationRef
                );

              if (
                !registrationSnap.exists()
              ) {
                throw new Error(
                  "Tilmeldingen findes ikke længere."
                );
              }

              if (
                !eventSnap.exists()
              ) {
                throw new Error(
                  "Eventet findes ikke længere."
                );
              }

              const currentRegistration =
                registrationSnap.data();

              const eventData =
                eventSnap.data();

              const approvedCount =
                Number(
                  eventData.approvedCount ??
                    0
                );

              if (
                currentRegistration.status ===
                "approved"
              ) {
                transaction.update(
                  eventRef,
                  {
                    approvedCount:
                      Math.max(
                        0,
                        approvedCount -
                          1
                      ),
                  }
                );
              }

              transaction.delete(
                registrationRef
              );
            }
          );
        } else {
          await runTransaction(
            db,
            async (
              transaction
            ) => {
              const registrationSnap =
                await transaction.get(
                  registrationRef
                );

              if (
                !registrationSnap.exists()
              ) {
                throw new Error(
                  "Tilmeldingen findes ikke længere."
                );
              }

              transaction.delete(
                registrationRef
              );
            }
          );
        }

        setMessage(
          "Din tilmelding er nu afmeldt."
        );

        setCancelPhone("");

        await loadEvents();
      } catch (e: any) {
        setError(
          e?.message ??
            "Afmeldingen kunne ikke gennemføres."
        );
      } finally {
        setCancelling(false);
      }
    };

  return (
    <main
      style={{
        maxWidth: 700,
        margin: "40px auto",
        padding:
          "0 20px",
        fontFamily:
          "system-ui",
      }}
    >
      <h1>
        Saunagus – tilmelding
      </h1>

      {message && (
        <p
          style={{
            color:
              "green",
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
            color:
              "crimson",
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
          Ingen åbne events lige nu.
        </p>
      ) : (
        <>
          {events.map(
            (event) => {
              const full =
                event.maxApproved >
                  0 &&
                event.approvedCount >=
                  event.maxApproved;

              return (
                <div
                  key={
                    event.id
                  }
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
                    {
                      event.title
                    }
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
                    {
                      event.approvedCount
                    }{" "}
                    /{" "}
                    {
                      event.maxApproved
                    }
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
              width:
                "100%",
              padding: 10,
              marginBottom:
                10,
            }}
          >
            {events.map(
              (event) => {
                const full =
                  event.maxApproved >
                    0 &&
                  event.approvedCount >=
                    event.maxApproved;

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
                    {
                      event.title
                    }
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
              width:
                "100%",
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
            value={
              phone
            }
            onChange={(e) =>
              setPhone(
                e.target.value
              )
            }
            style={{
              width:
                "100%",
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
              selected.maxApproved >
                0 &&
              selected.approvedCount >=
                selected.maxApproved;

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

      <hr
        style={{
          margin:
            "40px 0",
        }}
      />

      <h2>
        Afmeld din tilmelding
      </h2>

      <p>
        Hvis du ikke længere kan
        deltage, kan du selv afmelde
        din tilmelding her.
      </p>

      <select
        value={
          cancelEvent
        }
        onChange={(e) =>
          setCancelEvent(
            e.target.value
          )
        }
        style={{
          width:
            "100%",
          padding: 10,
          marginBottom:
            10,
        }}
      >
        <option value="">
          Vælg event
        </option>

        {events.map(
          (event) => (
            <option
              key={
                event.id
              }
              value={
                event.id
              }
            >
              {event.title}
            </option>
          )
        )}
      </select>

      <input
        type="tel"
        placeholder="Telefonnummer"
        value={
          cancelPhone
        }
        onChange={(e) =>
          setCancelPhone(
            e.target.value
          )
        }
        style={{
          width:
            "100%",
          padding: 10,
          marginBottom:
            10,
          boxSizing:
            "border-box",
        }}
      />

      <button
        onClick={
          cancelRegistration
        }
        disabled={
          cancelling
        }
        style={{
          padding:
            "10px 20px",
          background:
            "#d32f2f",
          color:
            "white",
          border:
            "none",
          borderRadius:
            4,
          cursor:
            cancelling
              ? "not-allowed"
              : "pointer",
          opacity:
            cancelling
              ? 0.6
              : 1,
        }}
      >
        {cancelling
          ? "Afmelder..."
          : "Afmeld mig"}
      </button>
    </main>
  );
}
