"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from "firebase/firestore";

import { auth, db } from "../../lib/firebase";

type EventItem = {
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

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loggedIn, setLoggedIn] = useState(false);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [registrations, setRegistrations] = useState<
    Registration[]
  >([]);

  const [title, setTitle] = useState("");
  const [maxApproved, setMaxApproved] = useState(10);
  const [isOpen, setIsOpen] = useState(true);
  const [startAt, setStartAt] = useState("");

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (user) {
          setLoggedIn(true);

          await loadEvents();
          await loadRegistrations();
        } else {
          setLoggedIn(false);
          setEvents([]);
          setRegistrations([]);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setMsg("");
    setErr("");

    try {
      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      setMsg("Logget ind ✓");
    } catch (e: any) {
      setErr(
        e?.message ?? "Login mislykkedes."
      );
    }
  };

  const logout = async () => {
    await signOut(auth);

    setLoggedIn(false);
    setEvents([]);
    setRegistrations([]);
    setMsg("Logget ud");
  };

  const loadEvents = async () => {
    try {
      const snap = await getDocs(
        collection(db, "events")
      );

      const data: EventItem[] = snap.docs
        .map((eventDoc) => {
          const d = eventDoc.data();

          return {
            id: eventDoc.id,
            title: d.title ?? "Uden titel",
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

      setEvents(data);
    } catch (e: any) {
      setErr(
        e?.message ??
          "Kunne ikke hente events."
      );
    }
  };

  const loadRegistrations = async () => {
    try {
      const snap = await getDocs(
        collection(db, "registrations")
      );

      const data: Registration[] =
        snap.docs.map((registrationDoc) => {
          const d = registrationDoc.data();

          return {
            id: registrationDoc.id,
            eventId: d.eventId ?? "",
            eventTitle:
              d.eventTitle ?? "Ukendt event",
            username:
              d.username ?? "",
            phone:
              d.phone ?? "",
            status:
              d.status ?? "pending",
          };
        });

      setRegistrations(data);
    } catch (e: any) {
      setErr(
        e?.message ??
          "Kunne ikke hente tilmeldinger."
      );
    }
  };

  const createEvent = async () => {
    setMsg("");
    setErr("");

    if (!title.trim()) {
      setErr("Indtast et eventnavn.");
      return;
    }

    if (!startAt) {
      setErr(
        "Vælg dato og tidspunkt."
      );
      return;
    }

    if (maxApproved < 1) {
      setErr(
        "Antal pladser skal være mindst 1."
      );
      return;
    }

    try {
      setLoading(true);

      await addDoc(
        collection(db, "events"),
        {
          title: title.trim(),
          isOpen,
          maxApproved:
            Number(maxApproved),
          approvedCount: 0,
          startAt: new Date(startAt),
          createdAt:
            serverTimestamp(),
        }
      );

      setTitle("");
      setMaxApproved(10);
      setIsOpen(true);
      setStartAt("");

      await loadEvents();

      setMsg(
        "Event oprettet ✓"
      );
    } catch (e: any) {
      setErr(
        e?.message ??
          "Eventet kunne ikke oprettes."
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleEvent = async (
    event: EventItem
  ) => {
    try {
      await updateDoc(
        doc(db, "events", event.id),
        {
          isOpen: !event.isOpen,
        }
      );

      await loadEvents();

      setMsg(
        event.isOpen
          ? "Event lukket."
          : "Event åbnet."
      );
    } catch (e: any) {
      setErr(
        e?.message ??
          "Eventets status kunne ikke ændres."
      );
    }
  };

  const deleteEvent = async (
    event: EventItem
  ) => {
    const confirmed =
      window.confirm(
        `Er du sikker på, at du vil slette "${event.title}"?\n\nEventet fjernes permanent.`
      );

    if (!confirmed) {
      return;
    }

    setMsg("");
    setErr("");

    try {
      await deleteDoc(
        doc(db, "events", event.id)
      );

      await loadEvents();

      setMsg(
        "Event slettet ✓"
      );
    } catch (e: any) {
      setErr(
        e?.message ??
          "Eventet kunne ikke slettes."
      );
    }
  };

  const approveRegistration = async (
    registration: Registration
  ) => {
    setMsg("");
    setErr("");

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const registrationRef =
            doc(
              db,
              "registrations",
              registration.id
            );

          const eventRef = doc(
            db,
            "events",
            registration.eventId
          );

          const registrationSnap =
            await transaction.get(
              registrationRef
            );

          const eventSnap =
            await transaction.get(
              eventRef
            );

          if (
            !registrationSnap.exists()
          ) {
            throw new Error(
              "Tilmeldingen findes ikke længere."
            );
          }

          if (!eventSnap.exists()) {
            throw new Error(
              "Eventet findes ikke længere."
            );
          }

          const registrationData =
            registrationSnap.data();

          const eventData =
            eventSnap.data();

          if (
            registrationData.status ===
            "approved"
          ) {
            return;
          }

          const approvedCount =
            Number(
              eventData.approvedCount ?? 0
            );

          const maxApproved =
            Number(
              eventData.maxApproved ?? 0
            );

          if (
            maxApproved > 0 &&
            approvedCount >=
              maxApproved
          ) {
            throw new Error(
              "Eventet er allerede fuldt booket."
            );
          }

          transaction.update(
            registrationRef,
            {
              status: "approved",
            }
          );

          transaction.update(
            eventRef,
            {
              approvedCount:
                approvedCount + 1,
            }
          );
        }
      );

      await loadEvents();
      await loadRegistrations();

      setMsg(
        "Tilmelding godkendt ✓"
      );
    } catch (e: any) {
      setErr(
        e?.message ??
          "Tilmeldingen kunne ikke godkendes."
      );
    }
  };

  const rejectRegistration = async (
    registration: Registration
  ) => {
    try {
      await updateDoc(
        doc(
          db,
          "registrations",
          registration.id
        ),
        {
          status: "rejected",
        }
      );

      await loadRegistrations();

      setMsg(
        "Tilmelding afvist."
      );
    } catch (e: any) {
      setErr(
        e?.message ??
          "Tilmeldingen kunne ikke afvises."
      );
    }
  };

  if (!loggedIn) {
    return (
      <main
        style={{
          maxWidth: 500,
          margin: "60px auto",
          padding: "0 20px",
          fontFamily:
            "system-ui",
        }}
      >
        <h1>PAR SAUNAGUS</h1>

        <h2>Admin login</h2>

        {err && (
          <p
            style={{
              color: "crimson",
            }}
          >
            {err}
          </p>
        )}

        {msg && (
          <p
            style={{
              color: "green",
            }}
          >
            {msg}
          </p>
        )}

        <input
          type="email"
          placeholder="Admin e-mail"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          style={{
            width: "100%",
            padding: 12,
            marginBottom: 10,
            boxSizing:
              "border-box",
          }}
        />

        <input
          type="password"
          placeholder="Adgangskode"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          style={{
            width: "100%",
            padding: 12,
            marginBottom: 10,
            boxSizing:
              "border-box",
          }}
        />

        <button
          onClick={login}
          style={{
            padding:
              "12px 20px",
            cursor: "pointer",
          }}
        >
          Log ind
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding:
          "30px 20px",
        fontFamily:
          "system-ui",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "center",
          marginBottom: 30,
        }}
      >
        <h1>
          PAR SAUNAGUS
        </h1>

        <button
          onClick={logout}
          style={{
            padding:
              "10px 18px",
            cursor: "pointer",
          }}
        >
          Log ud
        </button>
      </div>

      {msg && (
        <div
          style={{
            padding: 12,
            marginBottom: 15,
            background:
              "#e8f5e9",
            borderRadius: 8,
          }}
        >
          {msg}
        </div>
      )}

      {err && (
        <div
          style={{
            padding: 12,
            marginBottom: 15,
            background:
              "#ffebee",
            color:
              "#b71c1c",
            borderRadius: 8,
          }}
        >
          {err}
        </div>
      )}

      <section
        style={{
          marginBottom: 40,
        }}
      >
        <h2>Events</h2>

        {events.length === 0 ? (
          <p>Ingen events.</p>
        ) : (
          events.map((event) => {
            const eventRegistrations =
              registrations.filter(
                (registration) =>
                  registration.eventId ===
                  event.id
              );

            const pending =
              eventRegistrations.filter(
                (registration) =>
                  registration.status ===
                  "pending"
              );

            const approved =
              eventRegistrations.filter(
                (registration) =>
                  registration.status ===
                  "approved"
              );

            const rejected =
              eventRegistrations.filter(
                (registration) =>
                  registration.status ===
                  "rejected"
              );

            const full =
              event.maxApproved > 0 &&
              event.approvedCount >=
                event.maxApproved;

            return (
              <div
                key={event.id}
                style={{
                  border:
                    "1px solid #ccc",
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 20,
                }}
              >
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  {event.title}
                </h3>

                <div>
                  <strong>
                    Dato:
                  </strong>{" "}
                  {event.startAt
                    ? event.startAt
                        .toDate()
                        .toLocaleString(
                          "da-DK"
                        )
                    : "Ikke angivet"}
                </div>

                <div>
                  <strong>
                    Pladser:
                  </strong>{" "}
                  {
                    event.approvedCount
                  }{" "}
                  /{" "}
                  {
                    event.maxApproved
                  }
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontWeight:
                      "bold",
                    color:
                      full
                        ? "crimson"
                        : event.isOpen
                        ? "green"
                        : "#666",
                  }}
                >
                  {full
                    ? "FULDT BOOKET"
                    : event.isOpen
                    ? "ÅBEN"
                    : "LUKKET"}
                </div>

                <div
                  style={{
                    marginTop: 12,
                  }}
                >
                  <button
                    onClick={() =>
                      toggleEvent(
                        event
                      )
                    }
                    style={{
                      padding:
                        "9px 15px",
                      marginRight:
                        8,
                      cursor:
                        "pointer",
                    }}
                  >
                    {event.isOpen
                      ? "Luk event"
                      : "Åbn event"}
                  </button>

                  <button
                    onClick={() =>
                      deleteEvent(
                        event
                      )
                    }
                    style={{
                      padding:
                        "9px 15px",
                      cursor:
                        "pointer",
                    }}
                  >
                    Slet event
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 25,
                    borderTop:
                      "1px solid #ddd",
                    paddingTop: 15,
                  }}
                >
                  <h4>
                    Tilmeldinger
                  </h4>

                  <div
                    style={{
                      marginBottom: 15,
                    }}
                  >
                    <strong>
                      Afventer:
                    </strong>{" "}
                    {pending.length}
                    {" | "}
                    <strong>
                      Godkendt:
                    </strong>{" "}
                    {approved.length}
                    {" | "}
                    <strong>
                      Afvist:
                    </strong>{" "}
                    {rejected.length}
                  </div>

                  {pending.length >
                    0 && (
                    <div>
                      <h4>
                        Afventer godkendelse
                      </h4>

                      {pending.map(
                        (
                          registration
                        ) => (
                          <div
                            key={
                              registration.id
                            }
                            style={{
                              background:
                                "#fff8e1",
                              border:
                                "1px solid #ddd",
                              borderRadius:
                                8,
                              padding:
                                12,
                              marginBottom:
                                8,
                            }}
                          >
                            <strong>
                              {
                                registration.username
                              }
                            </strong>

                            <div>
                              Telefon:{" "}
                              {
                                registration.phone
                              }
                            </div>

                            <div
                              style={{
                                marginTop: 8,
                              }}
                            >
                              <button
                                onClick={() =>
                                  approveRegistration(
                                    registration
                                  )
                                }
                                style={{
                                  padding:
                                    "8px 12px",
                                  marginRight:
                                    8,
                                  cursor:
                                    "pointer",
                                }}
                              >
                                Godkend
                              </button>

                              <button
                                onClick={() =>
                                  rejectRegistration(
                                    registration
                                  )
                                }
                                style={{
                                  padding:
                                    "8px 12px",
                                  cursor:
                                    "pointer",
                                }}
                              >
                                Afvis
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {approved.length >
                    0 && (
                    <div
                      style={{
                        marginTop: 15,
                      }}
                    >
                      <h4>
                        Godkendte
                      </h4>

                      {approved.map(
                        (
                          registration
                        ) => (
                          <div
                            key={
                              registration.id
                            }
                            style={{
                              background:
                                "#e8f5e9",
                              border:
                                "1px solid #ddd",
                              borderRadius:
                                8,
                              padding:
                                10,
                              marginBottom:
                                6,
                            }}
                          >
                            <strong>
                              {
                                registration.username
                              }
                            </strong>
                            {" – "}
                            {
                              registration.phone
                            }
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {pending.length ===
                    0 &&
                    approved.length ===
                      0 &&
                    rejected.length ===
                      0 && (
                      <p>
                        Ingen tilmeldinger
                        til dette event.
                      </p>
                    )}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section
        style={{
          border:
            "1px solid #ddd",
          borderRadius: 10,
          padding: 20,
          marginBottom: 40,
        }}
      >
        <h2>
          Opret event
        </h2>

        <input
          type="text"
          placeholder="Eventnavn"
          value={title}
          onChange={(e) =>
            setTitle(
              e.target.value
            )
          }
          style={{
            width: "100%",
            padding: 12,
            marginBottom: 10,
            boxSizing:
              "border-box",
          }}
        />

        <input
          type="datetime-local"
          value={startAt}
          onChange={(e) =>
            setStartAt(
              e.target.value
            )
          }
          style={{
            width: "100%",
            padding: 12,
            marginBottom: 10,
            boxSizing:
              "border-box",
          }}
        />

        <input
          type="number"
          min="1"
          value={maxApproved}
          onChange={(e) =>
            setMaxApproved(
              Number(
                e.target.value
              )
            )
          }
          style={{
            width: "100%",
            padding: 12,
            marginBottom: 10,
            boxSizing:
              "border-box",
          }}
        />

        <label>
          <input
            type="checkbox"
            checked={isOpen}
            onChange={(e) =>
              setIsOpen(
                e.target.checked
              )
            }
          />{" "}
          Åben for tilmelding
        </label>

        <br />
        <br />

        <button
          onClick={createEvent}
          disabled={loading}
          style={{
            padding:
              "12px 20px",
            cursor:
              loading
                ? "not-allowed"
                : "pointer",
          }}
        >
          {loading
            ? "Opretter..."
            : "Opret event"}
        </button>
      </section>
    </main>
  );
}
