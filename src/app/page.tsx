"use client";

import { useEffect, useRef, useState } from "react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  Timestamp,
  query,
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

type UserProfile = {
  uid: string;
  username: string;
  phone: string;
  createdAt?: Timestamp;
};

type EventDoc = {
  title?: string;
  isOpen?: boolean;
  startAt?: Timestamp;
  maxApproved?: number;
  approvedCount?: number;
};

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
  uid: string;
  eventId: string;
  eventTitle: string;
  username: string;
  phone: string;
  status: "pending" | "approved" | "rejected";
  createdAt?: Timestamp;
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function toFirebasePhone(phone: string) {
  const digits = normalizePhone(phone);

  if (digits.startsWith("45") && digits.length === 10) {
    return `+${digits}`;
  }

  if (digits.length === 8) {
    return `+45${digits}`;
  }

  return "";
}

function formatDate(timestamp?: Timestamp) {
  if (!timestamp) return "";

  return timestamp.toDate().toLocaleString("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function HomePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  const [loginPhone, setLoginPhone] = useState("");
  const [username, setUsername] = useState("");

  const [code, setCode] = useState("");

  const [smsSent, setSmsSent] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  const [pendingUsername, setPendingUsername] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const confirmationResult =
    useRef<ConfirmationResult | null>(null);

  const recaptchaVerifier =
    useRef<RecaptchaVerifier | null>(null);

  /*
   * --------------------------------------------------
   * LOGIN-STATUS
   * --------------------------------------------------
   */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        setLoading(true);

        if (!firebaseUser) {
          setUser(null);
          setEvents([]);
          setRegistrations([]);
          setLoading(false);
          return;
        }

        try {
          const userRef = doc(
            db,
            "users",
            firebaseUser.uid
          );

          const userSnapshot =
            await getDoc(userRef);

          if (userSnapshot.exists()) {
            const data =
              userSnapshot.data();

            setUser({
              uid: firebaseUser.uid,
              username: data.username,
              phone: data.phone,
              createdAt: data.createdAt,
            });

            await loadEvents();
            await loadRegistrations();
          } else {
            /*
             * SMS-login er gennemført,
             * men brugeren mangler profil.
             *
             * Derfor viser vi oprettelse
             * af brugernavn.
             */
            setUser(null);
          }
        } catch (e: any) {
          console.error(e);

          setError(
            "Der opstod en fejl ved hentning af din brugerprofil."
          );
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  /*
   * --------------------------------------------------
   * EVENTS
   * --------------------------------------------------
   */

  async function loadEvents() {
    if (!auth.currentUser) {
      setEvents([]);
      return;
    }

    try {
      const snapshot =
        await getDocs(
          collection(db, "events")
        );

      const result: EventItem[] =
        snapshot.docs
          .map((eventDoc) => {
            const data =
              eventDoc.data() as EventDoc;

            return {
              id: eventDoc.id,
              title:
                data.title ?? "Uden titel",
              isOpen:
                Boolean(data.isOpen),
              startAt:
                data.startAt,
              maxApproved:
                Number(
                  data.maxApproved ?? 0
                ),
              approvedCount:
                Number(
                  data.approvedCount ?? 0
                ),
            };
          })
          .filter(
            (event) => event.isOpen
          )
          .sort((a, b) => {
            const aTime =
              a.startAt?.toMillis() ?? 0;

            const bTime =
              b.startAt?.toMillis() ?? 0;

            return aTime - bTime;
          });

      setEvents(result);
    } catch (e: any) {
      console.error(e);

      setError(
        "Kunne ikke hente events."
      );
    }
  }

  /*
   * --------------------------------------------------
   * MINE TILMELDINGER
   * --------------------------------------------------
   */

  async function loadRegistrations() {
    const firebaseUser =
      auth.currentUser;

    if (!firebaseUser) {
      setRegistrations([]);
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
            "uid",
            "==",
            firebaseUser.uid
          )
        );

      const snapshot =
        await getDocs(
          registrationsQuery
        );

      const result: Registration[] =
        snapshot.docs.map(
          (registrationDoc) => {
            const data =
              registrationDoc.data();

            return {
              id:
                registrationDoc.id,
              uid:
                data.uid,
              eventId:
                data.eventId,
              eventTitle:
                data.eventTitle,
              username:
                data.username,
              phone:
                data.phone,
              status:
                data.status,
              createdAt:
                data.createdAt,
            };
          }
        );

      setRegistrations(result);
    } catch (e: any) {
      console.error(e);

      setError(
        "Kunne ikke hente dine tilmeldinger."
      );
    }
  }

  /*
   * --------------------------------------------------
   * SMS
   * --------------------------------------------------
   */

  function clearRecaptcha() {
    if (recaptchaVerifier.current) {
      try {
        recaptchaVerifier.current.clear();
      } catch {}

      recaptchaVerifier.current = null;
    }
  }

  async function sendCode() {
    setError("");
    setMessage("");

    const firebasePhone =
      toFirebasePhone(loginPhone);

    if (!firebasePhone) {
      setError(
        "Indtast et gyldigt dansk telefonnummer på 8 cifre."
      );
      return;
    }

    if (creatingUser && !username.trim()) {
      setError(
        "Indtast det brugernavn, du vil bruge i logen."
      );
      return;
    }

    setSendingCode(true);

    try {
      clearRecaptcha();

      recaptchaVerifier.current =
        new RecaptchaVerifier(
          auth,
          "recaptcha-container",
          {
            size: "normal",
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

      if (creatingUser) {
        setPendingUsername(
          username.trim()
        );
      }

      setSmsSent(true);

      setMessage(
        "SMS-koden er sendt."
      );
    } catch (e: any) {
      console.error(e);

      setError(
        e?.message ??
          "Kunne ikke sende SMS-koden."
      );

      clearRecaptcha();
    } finally {
      setSendingCode(false);
    }
  }

  /*
   * --------------------------------------------------
   * BEKRÆFT SMS
   * --------------------------------------------------
   */

  async function confirmCode() {
    setError("");
    setMessage("");

    if (!confirmationResult.current) {
      setError(
        "Send først en SMS-kode."
      );
      return;
    }

    if (!code.trim()) {
      setError(
        "Indtast SMS-koden."
      );
      return;
    }

    try {
      const credential =
        await confirmationResult.current.confirm(
          code.trim()
        );

      const firebaseUser =
        credential.user;

      const userRef = doc(
        db,
        "users",
        firebaseUser.uid
      );

      const userSnapshot =
        await getDoc(userRef);

      /*
       * EKSISTERENDE BRUGER
       */
      if (userSnapshot.exists()) {
        const data =
          userSnapshot.data();

        setUser({
          uid: firebaseUser.uid,
          username: data.username,
          phone: data.phone,
          createdAt:
            data.createdAt,
        });

        setMessage(
          `Velkommen tilbage, ${data.username}!`
        );

        await loadEvents();
        await loadRegistrations();
      }

      /*
       * NY BRUGER
       */
      else {
        const finalUsername =
          pendingUsername.trim();

        if (!finalUsername) {
          setError(
            "Der mangler et brugernavn."
          );
          return;
        }

        /*
         * Kontroller at brugernavnet
         * ikke allerede bruges.
         */
        const usernameQuery =
          query(
            collection(
              db,
              "users"
            ),
            where(
              "username",
              "==",
              finalUsername
            )
          );

        const usernameSnapshot =
          await getDocs(
            usernameQuery
          );

        if (
          !usernameSnapshot.empty
        ) {
          setError(
            "Det brugernavn er allerede taget. Vælg et andet."
          );

          await signOut(auth);

          return;
        }

        const profile: UserProfile =
          {
            uid:
              firebaseUser.uid,

            username:
              finalUsername,

            phone:
              firebaseUser
                .phoneNumber ?? "",

            createdAt:
              Timestamp.now(),
          };

        await runTransaction(
          db,
          async (transaction) => {
            transaction.set(
              userRef,
              profile
            );
          }
        );

        setUser(profile);

        setMessage(
          `Velkommen ${finalUsername}! Du er nu medlem af logen.`
        );

        await loadEvents();
        await loadRegistrations();
      }

      confirmationResult.current =
        null;

      clearRecaptcha();

      setCode("");
      setSmsSent(false);
      setPendingUsername("");
    } catch (e: any) {
      console.error(e);

      setError(
        "SMS-koden er forkert eller udløbet."
      );
    }
  }

  /*
   * --------------------------------------------------
   * LOG UD
   * --------------------------------------------------
   */

  async function logout() {
    try {
      await signOut(auth);

      setUser(null);
      setEvents([]);
      setRegistrations([]);

      setMessage(
        "Du er logget ud."
      );
    } catch (e: any) {
      setError(
        "Kunne ikke logge ud."
      );
    }
  }

  /*
   * --------------------------------------------------
   * TILMELDING
   * --------------------------------------------------
   */

  async function registerForEvent(
    event: EventItem
  ) {
    setError("");
    setMessage("");

    const firebaseUser =
      auth.currentUser;

    if (!firebaseUser || !user) {
      setError(
        "Du skal være logget ind."
      );
      return;
    }

    const registrationId =
      `${event.id}_${firebaseUser.uid}`;

    const registrationRef =
      doc(
        db,
        "registrations",
        registrationId
      );

    try {
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
            eventData.isOpen !== true
          ) {
            throw new Error(
              "Eventet er ikke længere åbent."
            );
          }

          const maxApproved =
            Number(
              eventData.maxApproved ?? 0
            );

          const approvedCount =
            Number(
              eventData.approvedCount ?? 0
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

          const existing =
            await transaction.get(
              registrationRef
            );

          if (existing.exists()) {
            throw new Error(
              "Du er allerede tilmeldt dette event."
            );
          }

          transaction.set(
            registrationRef,
            {
              uid:
                firebaseUser.uid,

              eventId:
                event.id,

              eventTitle:
                eventData.title ??
                event.title,

              username:
                user.username,

              phone:
                firebaseUser
                  .phoneNumber ?? "",

              status:
                "pending",

              createdAt:
                Timestamp.now(),
            }
          );
        }
      );

      setMessage(
        `Din tilmelding til "${event.title}" er sendt og afventer godkendelse.`
      );

      await loadEvents();
      await loadRegistrations();
    } catch (e: any) {
      console.error(e);

      setError(
        e?.message ??
          "Tilmeldingen kunne ikke gennemføres."
      );
    }
  }

  /*
   * --------------------------------------------------
   * AFMELDING
   * --------------------------------------------------
   */

  async function cancelRegistration(
    registration: Registration
  ) {
    if (!auth.currentUser) {
      setError(
        "Du skal være logget ind."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Vil du afmelde dig fra "${registration.eventTitle}"?`
      );

    if (!confirmed) {
      return;
    }

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

          if (
            data.uid !==
            auth.currentUser?.uid
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

      await loadEvents();
      await loadRegistrations();
    } catch (e: any) {
      console.error(e);

      setError(
        e?.message ??
          "Afmeldingen kunne ikke gennemføres."
      );
    }
  }

  /*
   * --------------------------------------------------
   * LOADING
   * --------------------------------------------------
   */

  if (loading) {
    return (
      <main
        style={{
          maxWidth: 650,
          margin: "80px auto",
          padding: 20,
          fontFamily:
            "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <h1>
          Saunagus
        </h1>

        <p>
          Kontrollerer adgang...
        </p>
      </main>
    );
  }

  /*
   * --------------------------------------------------
   * LOGIN / OPRET BRUGER
   * --------------------------------------------------
   */

  if (!user) {
    return (
      <main
        style={{
          maxWidth: 500,
          margin: "70px auto",
          padding: 25,
          fontFamily:
            "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: 35,
          }}
        >
          <h1
            style={{
              fontSize: 38,
              marginBottom: 8,
            }}
          >
            Saunagus
          </h1>

          <p>
            Privat loge
          </p>

          <p
            style={{
              color: "#666",
            }}
          >
            Du skal være logget ind
            for at få adgang.
          </p>
        </div>

        <div
          style={{
            border:
              "1px solid #ddd",
            borderRadius: 12,
            padding: 25,
          }}
        >
          {!creatingUser ? (
            <>
              <h2>
                Log ind
              </h2>

              {!smsSent ? (
                <>
                  <p>
                    Indtast dit
                    telefonnummer.
                  </p>

                  <input
                    type="tel"
                    placeholder="Telefonnummer"
                    value={
                      loginPhone
                    }
                    onChange={(e) =>
                      setLoginPhone(
                        e.target.value
                      )
                    }
                    style={{
                      width:
                        "100%",
                      padding: 12,
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
                      sendCode
                    }
                    disabled={
                      sendingCode
                    }
                    style={{
                      width:
                        "100%",
                      padding: 13,
                    }}
                  >
                    {sendingCode
                      ? "Sender..."
                      : "Send SMS-kode"}
                  </button>

                  <button
                    onClick={() => {
                      setCreatingUser(
                        true
                      );
                      setError("");
                      setMessage("");
                    }}
                    style={{
                      width:
                        "100%",
                      padding: 13,
                      marginTop: 10,
                    }}
                  >
                    Opret ny bruger
                  </button>
                </>
              ) : (
                <>
                  <p>
                    Indtast den
                    SMS-kode, du har
                    modtaget.
                  </p>

                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="SMS-kode"
                    value={code}
                    onChange={(e) =>
                      setCode(
                        e.target.value.replace(
                          /\D/g,
                          ""
                        )
                      )
                    }
                    style={{
                      width:
                        "100%",
                      padding: 12,
                      marginBottom:
                        15,
                      boxSizing:
                        "border-box",
                    }}
                  />

                  <button
                    onClick={
                      confirmCode
                    }
                    style={{
                      width:
                        "100%",
                      padding: 13,
                    }}
                  >
                    Bekræft og log ind
                  </button>

                  <button
                    onClick={() => {
                      setSmsSent(
                        false
                      );
                      setCode("");
                      confirmationResult.current =
                        null;
                      clearRecaptcha();
                    }}
                    style={{
                      width:
                        "100%",
                      padding: 13,
                      marginTop: 10,
                    }}
                  >
                    Tilbage
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <h2>
                Opret bruger
              </h2>

              {!smsSent ? (
                <>
                  <p>
                    Du skal bruge et
                    brugernavn og dit
                    telefonnummer.
                  </p>

                  <input
                    type="text"
                    placeholder="Dit brugernavn"
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
                      padding: 12,
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
                      loginPhone
                    }
                    onChange={(e) =>
                      setLoginPhone(
                        e.target.value
                      )
                    }
                    style={{
                      width:
                        "100%",
                      padding: 12,
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
                      sendCode
                    }
                    disabled={
                      sendingCode
                    }
                    style={{
                      width:
                        "100%",
                      padding: 13,
                    }}
                  >
                    {sendingCode
                      ? "Sender..."
                      : "Send SMS-kode"}
                  </button>

                  <button
                    onClick={() => {
                      setCreatingUser(
                        false
                      );
                      setError("");
                      setMessage("");
                    }}
                    style={{
                      width:
                        "100%",
                      padding: 13,
                      marginTop: 10,
                    }}
                  >
                    Jeg har allerede en bruger
                  </button>
                </>
              ) : (
                <>
                  <p>
                    Vi har sendt en
                    SMS-kode til dit
                    telefonnummer.
                  </p>

                  <p>
                    Brugernavn:{" "}
                    <strong>
                      {
                        pendingUsername
                      }
                    </strong>
                  </p>

                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="SMS-kode"
                    value={code}
                    onChange={(e) =>
                      setCode(
                        e.target.value.replace(
                          /\D/g,
                          ""
                        )
                      )
                    }
                    style={{
                      width:
                        "100%",
                      padding: 12,
                      marginBottom:
                        15,
                      boxSizing:
                        "border-box",
                    }}
                  />

                  <button
                    onClick={
                      confirmCode
                    }
                    style={{
                      width:
                        "100%",
                      padding: 13,
                    }}
                  >
                    Opret bruger
                  </button>

                  <button
                    onClick={() => {
                      setSmsSent(
                        false
                      );
                      setCode("");
                      confirmationResult.current =
                        null;
                      clearRecaptcha();
                    }}
                    style={{
                      width:
                        "100%",
                      padding: 13,
                      marginTop: 10,
                    }}
                  >
                    Tilbage
                  </button>
                </>
              )}
            </>
          )}

          {message && (
            <p
              style={{
                color: "green",
                fontWeight:
                  "bold",
                marginTop: 20,
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
                marginTop: 20,
              }}
            >
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  /*
   * --------------------------------------------------
   * LOGGET IND
   * --------------------------------------------------
   */

  return (
    <main
      style={{
        maxWidth: 700,
        margin: "40px auto",
        padding: "0 20px 60px",
        fontFamily:
          "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 15,
          marginBottom: 30,
        }}
      >
        <div>
          <h1
            style={{
              marginBottom: 4,
            }}
          >
            Saunagus
          </h1>

          <div
            style={{
              color: "#666",
            }}
          >
            Velkommen{" "}
            <strong>
              {user.username}
            </strong>
          </div>
        </div>

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
      </header>

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

      <section
        style={{
          marginBottom: 35,
        }}
      >
        <h2>
          Mine tilmeldinger
        </h2>

        {registrations.length ===
        0 ? (
          <div
            style={{
              border:
                "1px solid #ddd",
              borderRadius: 10,
              padding: 18,
            }}
          >
            Du har ingen
            tilmeldinger endnu.
          </div>
        ) : (
          registrations.map(
            (registration) => (
              <div
                key={
                  registration.id
                }
                style={{
                  border:
                    "1px solid #ddd",
                  borderRadius: 10,
                  padding: 18,
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
                    marginTop: 7,
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
                        5,
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

      <section>
        <h2>
          Åbne events
        </h2>

        {events.length ===
        0 ? (
          <div
            style={{
              border:
                "1px solid #ddd",
              borderRadius: 10,
              padding: 18,
            }}
          >
            Der er ingen åbne
            events lige nu.
          </div>
        ) : (
          events.map(
            (event) => {
              const full =
                event.maxApproved >
                  0 &&
                event.approvedCount >=
                  event.maxApproved;

              const alreadyRegistered =
                registrations.some(
                  (registration) =>
                    registration.eventId ===
                    event.id
                );

              return (
                <div
                  key={
                    event.id
                  }
                  style={{
                    border:
                      "1px solid #ddd",
                    borderRadius: 10,
                    padding: 18,
                    marginBottom: 12,
                  }}
                >
                  <h3
                    style={{
                      margin:
                        "0 0 6px",
                    }}
                  >
                    {
                      event.title
                    }
                  </h3>

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

                  {full ? (
                    <div
                      style={{
                        color:
                          "crimson",
                        fontWeight:
                          "bold",
                        marginTop: 8,
                      }}
                    >
                      FULDT BOOKET
                    </div>
                  ) : alreadyRegistered ? (
                    <div
                      style={{
                        color:
                          "green",
                        fontWeight:
                          "bold",
                        marginTop: 8,
                      }}
                    >
                      Du er allerede
                      tilmeldt
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        registerForEvent(
                          event
                        )
                      }
                      style={{
                        marginTop: 12,
                        padding:
                          "10px 18px",
                      }}
                    >
                      Tilmeld mig
                    </button>
                  )}
                </div>
              );
            }
          )
        )}
      </section>
    </main>
  );
}
