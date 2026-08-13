"use client";

import { useEffect, useRef, useState } from "react";

import {
  collection,
  getDocs,
  runTransaction,
  doc,
  Timestamp,
  query,
  where,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  ConfirmationResult,
} from "firebase/auth";

import { auth, db } from "../lib/firebase";

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

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("45") && digits.length === 10) {
    return digits.substring(2);
  }

  if (digits.length === 8) {
    return digits;
  }

  return digits;
}

function toFirebasePhone(phone: string) {
  const local = normalizePhone(phone);

  if (local.length !== 8) {
    return "";
  }

  return `+45${local}`;
}

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [sending, setSending] = useState(false);

  const [showLogin, setShowLogin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const [loginPhone, setLoginPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const [myRegistrations, setMyRegistrations] = useState<
    Registration[]
  >([]);

  const confirmationResult = useRef<ConfirmationResult | null>(
    null
  );

  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(
    null
  );

  const registrationsInterval = useRef<
    ReturnType<typeof setInterval> | null
  >(null);

  const loadEvents = async () => {
    try {
      const snap = await getDocs(
        collection(db, "events")
      );

      const parsed: Event[] = snap.docs
        .map((eventDoc) => {
          const d = eventDoc.data() as EventDoc;

          return {
            id: eventDoc.id,
            title: d.title ?? "Uden titel",
            isOpen: Boolean(d.isOpen),
            startAt: d.startAt,
            maxApproved: Number(d.maxApproved ?? 0),
            approvedCount: Number(d.approvedCount ?? 0),
          };
        })
        .sort((a, b) => {
          const aTime = a.startAt?.toMillis() ?? 0;
          const bTime = b.startAt?.toMillis() ?? 0;

          return aTime - bTime;
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

      if (openEvents.length === 0) {
        setSelectedEvent("");
      }
    } catch (e: any) {
      setError(
        e?.message ?? "Kunne ikke hente events."
      );
    }
  };

  const loadMyRegistrations = async () => {
    const user = auth.currentUser;

    if (!user?.phoneNumber) {
      setMyRegistrations([]);
      return;
    }

    try {
      const localPhone = normalizePhone(
        user.phoneNumber
      );

      if (localPhone.length !== 8) {
        setMyRegistrations([]);
        return;
      }

      const internationalPhone =
        `+45${localPhone}`;

      const localQuery = query(
        collection(db, "registrations"),
        where("phone", "==", localPhone)
      );

      const internationalQuery = query(
        collection(db, "registrations"),
        where("phone", "==", internationalPhone)
      );

      const [localSnap, internationalSnap] =
        await Promise.all([
          getDocs(localQuery),
          getDocs(internationalQuery),
        ]);

      const registrationMap =
        new Map<string, Registration>();

      localSnap.docs.forEach((registrationDoc) => {
        const d = registrationDoc.data();

        registrationMap.set(
          registrationDoc.id,
          {
            id: registrationDoc.id,
            eventId: d.eventId ?? "",
            eventTitle:
              d.eventTitle ?? "Uden titel",
            username: d.username ?? "",
            phone: d.phone ?? "",
            status:
              d.status ?? "pending",
          }
        );
      });

      internationalSnap.docs.forEach(
        (registrationDoc) => {
          const d = registrationDoc.data();

          registrationMap.set(
            registrationDoc.id,
            {
              id: registrationDoc.id,
              eventId: d.eventId ?? "",
              eventTitle:
                d.eventTitle ?? "Uden titel",
              username: d.username ?? "",
              phone: d.phone ?? "",
              status:
                d.status ?? "pending",
            }
          );
        }
      );

      setMyRegistrations(
        Array.from(
          registrationMap.values()
        )
      );
    } catch (e: any) {
      console.error(
        "Fejl ved hentning af tilmeldinger:",
        e
      );

      setError(
        e?.message ??
          "Kunne ikke hente dine tilmeldinger."
      );
    }
  };

  useEffect(() => {
    loadEvents();

    const eventsInterval =
      setInterval(
        loadEvents,
        5000
      );

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (user) {
            setLoggedIn(true);

            await loadMyRegistrations();

            if (
              registrationsInterval.current
            ) {
              clearInterval(
                registrationsInterval.current
              );
            }

            registrationsInterval.current =
              setInterval(
                loadMyRegistrations,
                5000
              );
          } else {
            setLoggedIn(false);
            setMyRegistrations([]);

            if (
              registrationsInterval.current
            ) {
              clearInterval(
                registrationsInterval.current
              );

              registrationsInterval.current =
                null;
            }
          }
        }
      );

    return () => {
      clearInterval(eventsInterval);

      unsubscribe();

      if (
        registrationsInterval.current
      ) {
        clearInterval(
          registrationsInterval.current
        );

        registrationsInterval.current =
          null;
      }

      if (
        recaptchaVerifier.current
      ) {
        try {
          recaptchaVerifier.current.clear();
        } catch {}

        recaptchaVerifier.current =
          null;
      }
    };
  }, []);

  const openLogin = () => {
    setMessage("");
    setError("");
    setShowLogin(true);
  };

  const closeLogin = () => {
    setShowLogin(false);
    setCodeSent(false);
    setVerificationCode("");
    setLoginPhone("");

    confirmationResult.current =
      null;

    if (
      recaptchaVerifier.current
    ) {
      try {
        recaptchaVerifier.current.clear();
      } catch {}

      recaptchaVerifier.current =
        null;
    }
  };

  const sendLoginCode =
    async () => {
      if (loggingIn) return;

      setMessage("");
      setError("");

      const firebasePhone =
        toFirebasePhone(
          loginPhone
        );

      if (!firebasePhone) {
        setError(
          "Indtast et gyldigt dansk telefonnummer på 8 cifre."
        );
        return;
      }

      setLoggingIn(true);

      try {
        if (
          recaptchaVerifier.current
        ) {
          try {
            recaptchaVerifier.current.clear();
          } catch {}

          recaptchaVerifier.current =
            null;
        }

        recaptchaVerifier.current =
          new RecaptchaVerifier(
            auth,
            "recaptcha-container",
            {
              size: "normal",
              callback: () => {},
              "expired-callback":
                () => {
                  setError(
                    "Sikkerhedstjekket er udløbet. Prøv igen."
                  );
                },
            }
          );

        const result =
          await signInWithPhoneNumber(
            auth,
            firebasePhone,
            recaptchaVerifier.current
          );

        confirmationResult.current =
          result;

        setCodeSent(true);

        setMessage(
          "SMS-koden er sendt til dit telefonnummer."
        );
      } catch (e: any) {
        console.error(e);

        if (
          recaptchaVerifier.current
        ) {
          try {
            recaptchaVerifier.current.clear();
          } catch {}

          recaptchaVerifier.current =
            null;
        }

        setError(
          e?.message ??
            "SMS-koden kunne ikke sendes."
        );
      } finally {
        setLoggingIn(false);
      }
    };

  const confirmLogin =
    async () => {
      if (loggingIn) return;

      setMessage("");
      setError("");

      if (
        !confirmationResult.current
      ) {
        setError(
          "Send først en SMS-kode."
        );
        return;
      }

      if (
        !verificationCode.trim()
      ) {
        setError(
          "Indtast koden fra SMS'en."
        );
        return;
      }

      setLoggingIn(true);

      try {
        await confirmationResult.current.confirm(
          verificationCode.trim()
        );

        setLoggedIn(true);
        setShowLogin(false);
        setCodeSent(false);
        setVerificationCode("");

        confirmationResult.current =
          null;

        if (
          recaptchaVerifier.current
        ) {
          try {
            recaptchaVerifier.current.clear();
          } catch {}

          recaptchaVerifier.current =
            null;
        }

        setMessage(
          "Du er nu logget ind."
        );

        await loadMyRegistrations();
      } catch (e: any) {
        console.error(e);

        setError(
          "Koden er forkert eller udløbet. Prøv igen."
        );
      } finally {
        setLoggingIn(false);
      }
    };

  const logout = async () => {
    try {
      await signOut(auth);

      setLoggedIn(false);
      setMyRegistrations([]);

      if (
        registrationsInterval.current
      ) {
        clearInterval(
          registrationsInterval.current
        );

        registrationsInterval.current =
          null;
      }

      setMessage(
        "Du er logget ud."
      );
    } catch (e: any) {
      setError(
        e?.message ??
          "Kunne ikke logge ud."
      );
    }
  };

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

      const localPhone =
        normalizePhone(phone);

      if (
        localPhone.length !== 8
      ) {
        setError(
          "Indtast et gyldigt dansk telefonnummer på 8 cifre."
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
                  localPhone,

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

        if (loggedIn) {
          await loadMyRegistrations();
        }
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
    async (
      registration: Registration
    ) => {
      const confirmed =
        window.confirm(
          `Er du sikker på, at du vil afmelde dig fra "${registration.eventTitle}"?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setMessage("");
        setError("");

        const registrationRef =
          doc(
            db,
            "registrations",
            registration.id
          );

        const eventRef =
          doc(
            db,
            "events",
            registration.eventId
          );

        await runTransaction(
          db,
          async (transaction) => {
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

            const registrationData =
              registrationSnap.data();

            if (
              registrationData.status ===
              "approved"
            ) {
              const eventSnap =
                await transaction.get(
                  eventRef
                );

              if (
                eventSnap.exists()
              ) {
                const eventData =
                  eventSnap.data();

                const approvedCount =
                  Number(
                    eventData.approvedCount ??
                      0
                  );

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
            }

            transaction.delete(
              registrationRef
            );
          }
        );

        setMessage(
          "Du er nu afmeldt."
        );

        await loadMyRegistrations();
        await loadEvents();
      } catch (e: any) {
        setError(
          e?.message ??
            "Afmeldingen kunne ikke gennemføres."
        );
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
      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          alignItems:
            "center",
          gap: 15,
          marginBottom:
            25,
        }}
      >
        <h1>
          Saunagus
        </h1>

        {!loggedIn ? (
          <button
            onClick={
              openLogin
            }
            style={{
              padding:
                "10px 15px",
            }}
          >
            Mine tilmeldinger
          </button>
        ) : (
          <button
            onClick={
              logout
            }
            style={{
              padding:
                "10px 15px",
            }}
          >
            Log ud
          </button>
        )}
      </div>

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

      {showLogin && (
        <section
          style={{
            border:
              "1px solid #ddd",
            borderRadius:
              10,
            padding: 20,
            marginBottom:
              30,
          }}
        >
          <h2>
            Log ind
          </h2>

          {!codeSent ? (
            <>
              <p>
                Indtast dit
                telefonnummer.
                Du får en
                engangskode
                på SMS.
              </p>

              <input
                type="tel"
                placeholder="Telefonnummer"
                value={
                  loginPhone
                }
                onChange={(
                  e
                ) =>
                  setLoginPhone(
                    e.target.value
                  )
                }
                style={{
                  width:
                    "100%",
                  padding: 10,
                  marginBottom:
                    15,
                  boxSizing:
                    "border-box",
                }}
              />

              <div
                id="recaptcha-container"
                style={{
                  marginBottom:
                    15,
                }}
              />

              <button
                onClick={
                  sendLoginCode
                }
                disabled={
                  loggingIn
                }
                style={{
                  padding:
                    "10px 20px",
                  marginRight:
                    10,
                }}
              >
                {loggingIn
                  ? "Sender..."
                  : "Send SMS-kode"}
              </button>

              <button
                onClick={
                  closeLogin
                }
                style={{
                  padding:
                    "10px 20px",
                }}
              >
                Annuller
              </button>
            </>
          ) : (
            <>
              <p>
                Indtast den
                kode, du har
                modtaget på
                SMS.
              </p>

              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="SMS-kode"
                value={
                  verificationCode
                }
                onChange={(
                  e
                ) =>
                  setVerificationCode(
                    e.target.value.replace(
                      /\D/g,
                      ""
                    )
                  )
                }
                style={{
                  width:
                    "100%",
                  padding: 10,
                  marginBottom:
                    15,
                  boxSizing:
                    "border-box",
                }}
              />

              <button
                onClick={
                  confirmLogin
                }
                disabled={
                  loggingIn
                }
                style={{
                  padding:
                    "10px 20px",
                  marginRight:
                    10,
                }}
              >
                {loggingIn
                  ? "Logger ind..."
                  : "Log ind"}
              </button>

              <button
                onClick={() => {
                  setCodeSent(
                    false
                  );

                  setVerificationCode(
                    ""
                  );

                  confirmationResult.current =
                    null;

                  if (
                    recaptchaVerifier.current
                  ) {
                    try {
                      recaptchaVerifier.current.clear();
                    } catch {}

                    recaptchaVerifier.current =
                      null;
                  }
                }}
                style={{
                  padding:
                    "10px 20px",
                }}
              >
                Nyt nummer
              </button>
            </>
          )}
        </section>
      )}

      {loggedIn && (
        <section
          style={{
            border:
              "1px solid #ddd",
            borderRadius:
              10,
            padding: 20,
            marginBottom:
              35,
          }}
        >
          <h2>
            Mine tilmeldinger
          </h2>

          {myRegistrations.length ===
          0 ? (
            <p>
              Du har ingen aktive
              tilmeldinger.
            </p>
          ) : (
            myRegistrations.map(
              (
                registration
              ) => (
                <div
                  key={
                    registration.id
                  }
                  style={{
                    border:
                      "1px solid #ddd",
                    borderRadius:
                      8,
                    padding: 15,
                    marginBottom:
                      10,
                  }}
                >
                  <strong>
                    {
                      registration.eventTitle
                    }
                  </strong>

                  <div
                    style={{
                      marginTop:
                        5,
                    }}
                  >
                    Status:{" "}
                    <strong>
                      {registration.status ===
                      "approved"
                        ? "Godkendt"
                        : registration.status ===
                          "pending"
                        ? "Afventer godkendelse"
                        : "Afvist"}
                    </strong>
                  </div>

                  <button
                    onClick={() =>
                      cancelRegistration(
                        registration
                      )
                    }
                    style={{
                      marginTop:
                        12,
                      padding:
                        "9px 15px",
                      background:
                        "#d32f2f",
                      color:
                        "white",
                      border:
                        "none",
                      borderRadius:
                        4,
                      cursor:
                        "pointer",
                    }}
                  >
                    Afmeld
                  </button>
                </div>
              )
            )
          )}
        </section>
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
    </main>
  );
}
