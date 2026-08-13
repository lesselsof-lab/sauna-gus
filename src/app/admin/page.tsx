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
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
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
  const [startAt, setStartAt] = useState("");
  const [maxApproved, setMaxApproved] = useState(10);
  const [isOpen, setIsOpen] = useState(true);

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

  async function login() {
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
  }

  async function logout() {
    await signOut(auth);
  }

  async function loadEvents() {
    try {
      const snap = await getDocs(
        collection(db, "events")
      );

      const data: EventItem[] = snap.docs
        .map((item) => {
          const d = item.data();

          return {
            id: item.id,
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
  }

  async function loadRegistrations() {
    try {
      const snap = await getDocs(
        collection(db, "registrations")
      );

      const data: Registration[] =
        snap.docs.map((item) => {
          const d = item.data();

          return {
            id: item.id,
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
  }

  async function createEvent() {
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

    if (Number(maxApproved) < 1) {
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
          startAt: new Date(startAt),
          maxApproved:
            Number(maxApproved),
          approvedCount: 0,
          isOpen,
          createdAt:
            serverTimestamp(),
        }
      );

      setTitle("");
      setStartAt("");
      setMaxApproved(10);
      setIsOpen(true);

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
  }

  async function toggleEvent(
    event: EventItem
  ) {
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
  }

  async function deleteEvent(
    event: EventItem
  ) {
    const confirmed =
      window.confirm(
        `Er du sikker på, at du vil slette "${event.title}"?\n\nEventet OG alle tilmeldinger til eventet slettes permanent.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setMsg("");
      setErr("");

      const registrationSnap =
        await getDocs(
          collection(db, "registrations")
        );

      const batch = writeBatch(db);

      let deletedRegistrations = 0;

      registrationSnap.docs.forEach(
        (registrationDoc) => {
          const data =
            registrationDoc.data();

          if (
            data.eventId ===
            event.id
          ) {
            batch.delete(
              registrationDoc.ref
            );

            deletedRegistrations++;
          }
        }
      );

      batch.delete(
        doc(db, "events", event.id)
      );

      await batch.commit();

      await loadEvents();
      await loadRegistrations();

      setMsg(
        `"${event.title}" er slettet sammen med ${deletedRegistrations} tilmelding(er) ✓`
      );
    } catch (e: any) {
      setErr(
        e?.message ??
          "Eventet kunne ikke slettes."
      );
    }
  }

  async function approveRegistration(
    registration: Registration
  ) {
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
  }

  async function rejectRegistration(
    registration: Registration
  ) {
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
  }

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
        <h1>
          PAR SAUNAGUS
        </h1>

        <h2>
          Admin login
        </h2>

        {err && (
          <p
            style={{
              color:
                "crimson",
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
            setEmail(
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
          type="password"
          placeholder="Adgangskode"
          value={password}
          onChange={(e) =>
            setPassword(
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

        <button
          onClick={login}
          style={{
            padding:
              "12px 20px",
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

      <h2>
        Events
      </h2>

      {events.length === 0 ? (
        <p>
          Ingen events.
        </p>
      ) : (
        events.map(
          (event) => {
            const eventRegistrations =
              registrations.filter(
                (r) =>
                  r.eventId ===
                  event.id
              );

            const pending =
              eventRegistrations.filter(
                (r) =>
                  r.status ===
                  "pending"
              );

            const approved =
              eventRegistrations.filter(
                (r) =>
                  r.status ===
                  "approved"
              );

            const rejected =
              eventRegistrations.filter(
                (r) =>
                  r.status ===
                  "rejected"
              );

            const full =
              event.maxApproved >
                0 &&
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
                    color: full
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
                    display:
                      "flex",
                    gap: 8,
                    flexWrap:
                      "wrap",
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
                      background:
                        "#d32f2f",
                      color:
                        "white",
                      border:
                        "none",
                      borderRadius: 4,
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

                  <p>
                    <strong>
                      Afventer:
                    </strong>{" "}
                    {
                      pending.length
                    }
                    {" | "}
                    <strong>
                      Godkendt:
                    </strong>{" "}
                    {
                      approved.length
                    }
                    {" | "}
                    <strong>
                      Afvist:
                    </strong>{" "}
                    {
                      rejected.length
                    }
                  </p>

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
                            }}
                          >
                            Afvis
                          </button>
                        </div>
                      </div>
                    )
                  )}

                  {approved.length >
                    0 && (
                    <>
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
                              padding:
                                10,
                              marginBottom:
                                6,
                              borderRadius:
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
                    </>
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
          }
        )
      )}

      <section
        style={{
          border:
            "1px solid #ddd",
          borderRadius: 10,
          padding: 20,
          marginTop: 40,
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
          onClick={
            createEvent
          }
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
