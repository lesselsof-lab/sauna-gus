"use client";

import { useEffect, useRef, useState } from "react";

import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  where,
} from "firebase/firestore";

import {
  ConfirmationResult,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
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

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("45") && digits.length === 10) {
    return digits.substring(2);
  }

  return digits;
}

function toFirebasePhone(phone: string): string {
  const localPhone = normalizePhone(phone);

  if (localPhone.length !== 8) {
    return "";
  }

  return `+45${localPhone}`;
}

function formatDate(timestamp?: Timestamp): string {
  if (!timestamp) {
    return "";
  }

  return timestamp.toDate().toLocaleString("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [loggedIn, setLoggedIn] = useState(false);

  const [showLogin, setShowLogin] = useState(false);
  const [loginPhone, setLoginPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const [loggingIn, setLoggingIn] = useState(false);
  const [sending, setSending] = useState(false);

  const [myRegistrations, setMyRegistrations] = useState<
    Registration[]
  >([]);

  const confirmationResult =
    useRef<ConfirmationResult | null>(null);

  const recaptchaVerifier =
    useRef<RecaptchaVerifier | null>(null);

  const eventsTimer =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const registrationsTimer =
    useRef<ReturnType<typeof setInterval> | null>(null);

  /*
   * Hent åbne events
   */
  const loadEvents = async () => {
    try {
      const snapshot = await getDocs(
        collection(db, "events")
      );

      const loadedEvents: Event[] = snapshot.docs
        .map((eventDoc) => {
          const data =
            eventDoc.data() as EventDoc;

          return {
            id: eventDoc.id,
            title: data.title ?? "Uden titel",
            isOpen: Boolean(data.isOpen),
            startAt: data.startAt,
            maxApproved: Number(
              data.maxApproved ?? 0
            ),
            approvedCount: Number(
              data.approvedCount ?? 0
            ),
          };
        })
        .filter((event) => event.isOpen)
        .sort((a, b) => {
          const aTime =
            a.startAt?.toMillis() ?? 0;

          const bTime =
            b.startAt?.toMillis() ?? 0;

          return aTime - bTime;
        });

      setEvents(loadedEvents);

      if (loadedEvents.length === 0) {
        setSelectedEvent("");
        return;
      }

      setSelectedEvent((current) => {
        const stillExists =
          loadedEvents.some(
            (event) => event.id === current
          );

        return stillExists
          ? current
          : loadedEvents[0].id;
      });
    } catch (e: any) {
      console.error(e);

      setError(
        e?.message ??
          "Kunne ikke hente events."
      );
    }
  };

  /*
   * Hent kundens egne tilmeldinger
   */
  const loadMyRegistrations = async () => {
    const user = auth.currentUser;

    if (!user?.phoneNumber) {
      setMyRegistrations([]);
      return;
    }

    try {
      const registrationsQuery = query(
        collection(db, "registrations"),
        where(
          "phone",
          "==",
          user.phoneNumber
        )
      );

      const snapshot = await getDocs(
        registrationsQuery
      );

      const registrations: Registration[] =
        snapshot.docs.map((registrationDoc) => {
          const data =
            registrationDoc.data();

          return {
            id: registrationDoc.id,
            eventId:
              data.eventId ?? "",
            eventTitle:
              data.eventTitle ??
              "Uden titel",
            username:
              data.username ?? "",
            phone:
              data.phone ?? "",
            status:
              data.status ?? "pending",
          };
        });

      setMyRegistrations(registrations);
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

  /*
   * Login-status
   */
  useEffect(() => {
    loadEvents();

    eventsTimer.current =
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
              registrationsTimer.current
            ) {
              clearInterval(
                registrationsTimer.current
              );
            }

            registrationsTimer.current =
              setInterval(
                loadMyRegistrations,
                5000
              );
          } else {
            setLoggedIn(false);
            setMyRegistrations([]);

            if (
              registrationsTimer.current
            ) {
              clearInterval(
                registrationsTimer.current
              );

              registrationsTimer.current =
                null;
            }
          }
        }
      );

    return () => {
      unsubscribe();

      if (eventsTimer.current) {
        clearInterval(
          eventsTimer.current
        );
      }

      if (
        registrationsTimer.current
      ) {
        clearInterval(
          registrationsTimer.current
        );
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

  /*
   * Åbn login
   */
  const openLogin = () => {
    setMessage("");
    setError("");

    setLoginPhone("");
    setVerificationCode("");
    setCodeSent(false);

    setShowLogin(true);
  };

  /*
   * Luk login
   */
  const closeLogin = () => {
    setShowLogin(false);

    setLoginPhone("");
    setVerificationCode("");
    setCodeSent(false);

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

  /*
   * Send SMS-login
   */
  const sendLoginCode = async () => {
    if (loggingIn) {
      return;
    }

    setMessage("");
    setError("");

    const firebasePhone =
      toFirebasePhone(loginPhone);

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
            "expired-callback": () => {
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
        "SMS-koden er sendt."
      );
    } catch (e: any) {
      console.error(e);

      setError(
        e?.message ??
          "SMS-koden kunne ikke sendes."
      );

      if (
        recaptchaVerifier.current
      ) {
        try {
          recaptchaVerifier.current.clear();
        } catch {}

        recaptchaVerifier.current =
          null;
      }
    } finally {
      setLoggingIn(false);
    }
  };

  /*
   * Bekræft SMS-kode
   */
  const confirmLogin = async () => {
    if (loggingIn) {
      return;
    }

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
      verificationCode.trim().length === 0
    ) {
      setError(
        "Indtast SMS-koden."
      );
      return;
    }

    setLoggingIn(true);

    try {
      await confirmationResult.current.confirm(
        verificationCode.trim()
      );

      confirmationResult.current =
        null;

      setLoggedIn(true);
      setShowLogin(false);
      setCodeSent(false);
      setVerificationCode("");

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
        "SMS-koden er forkert eller udløbet."
      );
    } finally {
      setLoggingIn(false);
    }
  };

  /*
   * Log ud
   */
  const logout = async () => {
    try {
      await signOut(auth);

      setLoggedIn(false);
      setMyRegistrations([]);

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

  /*
   * Opret tilmelding
   */
  const submitRegistration =
    async () => {
      if (sending) {
        return;
      }

      setMessage("");
      setError("");

      if (!selectedEvent) {
        setError(
          "Vælg et event."
        );
        return;
      }

      if (!username.trim()) {
        setError(
          "Indtast dit brugernavn."
        );
        return;
      }

      if (!phone.trim()) {
        setError(
          "Indtast dit telefonnummer."
        );
        return;
      }

      const firebasePhone =
        toFirebasePhone(phone);

      if (!firebasePhone) {
        setError(
          "Indtast et gyldigt dansk telefonnummer på 8 cifre."
        );
        return;
      }

      const event =
        events.find(
          (item) =>
            item.id === selectedEvent
        );

      if (!event) {
        setError(
          "Det valgte event blev ikke fundet."
        );
        return;
      }

      setSending(true);

      try {
        /*
         * Tjek dublet.
         */
        const existingQuery =
          query(
            collection(
              db,
              "registrations"
            ),
            where(
              "phone",
              "==",
              firebasePhone
            ),
            where(
              "eventId",
              "==",
              event.id
            )
          );

        const existingSnapshot =
          await getDocs(
            existingQuery
          );

        if (
          !existingSnapshot.empty
        ) {
          setError(
            "Du er allerede tilmeldt dette event."
          );
          setSending(false);
          return;
        }

        /*
         * Tjek plads.
         *
         * approvedCount ændres IKKE her.
         * Pladsen tæller først, når admin
         * godkender tilmeldingen.
         */
        if (
          event.maxApproved > 0 &&
          event.approvedCount >=
            event.maxApproved
        ) {
          setError(
            "Eventet er fuldt booket."
          );
          setSending(false);
          return;
        }

        /*
         * Opret tilmeldingen.
         */
        await runTransaction(
          db,
          async (transaction) => {
            const eventRef =
              doc(
                db,
                "events",
                event.id
              );

            const eventSnapshot =
              await transaction.get(
                eventRef
              );

            if (
              !eventSnapshot.exists()
            ) {
              throw new Error(
                "Eventet findes ikke længere."
              );
            }

            const eventData =
              eventSnapshot.data() as EventDoc;

            if (
              !eventData.isOpen
            ) {
              throw new Error(
                "Eventet er ikke længere åbent."
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
                  event.id,

                eventTitle:
                  eventData.title ??
                  event.title,

                username:
                  username.trim(),

                phone:
                  firebasePhone,

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
        console.error(e);

        setError(
          e?.message ??
            "Tilmeldingen kunne ikke sendes."
        );
      } finally {
        setSending(false);
      }
    };

  /*
   * Afmeld kunde
   *
   * Kunden sletter KUN sin egen tilmelding.
   * Kunden ændrer ikke events eller approvedCount.
   */
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

      setMessage("");
      setError("");

      try {
        const registrationRef =
          doc(
            db,
            "registrations",
            registration.id
          );

        await runTransaction(
          db,
          async (transaction) => {
            const snapshot =
              await transaction.get(
                registrationRef
              );

            if (
              !snapshot.exists()
            ) {
              throw new Error(
                "Tilmeldingen findes ikke længere."
              );
            }

            const data =
              snapshot.data();

            /*
             * Ekstra sikkerhed i klienten.
             *
             * Vi kontrollerer, at den tilmelding
             * faktisk tilhører den bruger, der
             * forsøger at slette den.
             */
            const currentUser =
              auth.currentUser;

            if (
              !currentUser?.phoneNumber
            ) {
              throw new Error(
                "Du skal være logget ind."
              );
            }

            if (
              data.phone !==
              currentUser.phoneNumber
            ) {
              throw new Error(
                "Du kan kun afmelde dine egne tilmeldinger."
              );
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
        console.error(e);

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
        margin: "40px auto",
        padding: "0 20px",
        fontFamily: "system-ui",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 15,
          marginBottom: 25,
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
            color: "green",
            fontWeight: "bold",
          }}
        >
          {message}
        </p>
      )}

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

      {showLogin && (
        <section
          style={{
            border:
              "1px solid #ddd",
            borderRadius: 10,
            padding: 20,
            marginBottom: 30,
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
                Indtast koden,
                du har modtaget
                på SMS.
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
            borderRadius: 10,
            padding: 20,
            marginBottom: 35,
          }}
        >
          <h2>
            Mine tilmeldinger
          </h2>

          {myRegistrations.length ===
          0 ? (
            <p>
              Du har ingen
              aktive
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
                    borderRadius: 8,
                    padding: 15,
                    marginBottom: 10,
                  }}
                >
                  <strong>
                    {
                      registration.eventTitle
                    }
                  </strong>

                  <div
                    style={{
                      marginTop: 6,
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

                  {registration.status !==
                    "rejected" && (
                    <button
                      onClick={() =>
                        cancelRegistration(
                          registration
                        )
                      }
                      style={{
                        marginTop: 12,
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
                  )}
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
                    marginBottom: 10,
                    borderRadius: 8,
                  }}
                >
                  <strong>
                    {
                      event.title
                    }
                  </strong>

                  {event.startAt && (
                    <div>
                      {formatDate(
                        event.startAt
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 8,
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
                        marginTop: 5,
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
              marginBottom: 10,
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
              marginBottom: 10,
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
              marginBottom: 10,
              boxSizing:
                "border-box",
            }}
          />

          <button
            onClick={
              submitRegistration
            }
            disabled={
              sending ||
              (() => {
                const event =
                  events.find(
                    (item) =>
                      item.id ===
                      selectedEvent
                  );

                return Boolean(
                  event &&
                    event.maxApproved >
                      0 &&
                    event.approvedCount >=
                      event.maxApproved
                );
              })()
            }
            style={{
              padding:
                "10px 20px",
              cursor:
                sending
                  ? "not-allowed"
                  : "pointer",
              opacity:
                sending
                  ? 0.5
                  : 1,
            }}
          >
            {sending
              ? "Sender..."
              : "Send tilmelding"}
          </button>
        </>
      )}
    </main>
  );
}
