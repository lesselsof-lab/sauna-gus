// src/app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
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

type UserProfile = {
  uid: string;
  username: string;
  phone: string;
  createdAt?: Timestamp;
  isAdmin?: boolean;
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

function toFirebasePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return `+45${digits}`;
  if (digits.startsWith("45") && digits.length === 10) return `+${digits}`;
  return "";
}

function formatDate(timestamp?: Timestamp) {
  if (!timestamp) return "";
  return timestamp.toDate().toLocaleString("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function statusText(status: Registration["status"]) {
  if (status === "approved") return "Godkendt";
  if (status === "rejected") return "Afvist";
  return "Afventer godkendelse";
}

export default function HomePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  const [creatingUser, setCreatingUser] = useState(false);
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [pendingUsername, setPendingUsername] = useState("");
  const [code, setCode] = useState("");

  const [smsSent, setSmsSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [busyEvent, setBusyEvent] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const confirmationResult = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);

  function clearRecaptcha() {
    if (recaptchaVerifier.current) {
      try {
        recaptchaVerifier.current.clear();
      } catch {}
      recaptchaVerifier.current = null;
    }
  }

  async function loadEvents() {
    if (!auth.currentUser) {
      setEvents([]);
      return;
    }

    try {
      const snapshot = await getDocs(collection(db, "events"));

      const result: EventItem[] = snapshot.docs
        .map((eventDoc) => {
          const data = eventDoc.data() as EventDoc;

          return {
            id: eventDoc.id,
            title: data.title ?? "Uden titel",
            isOpen: data.isOpen === true,
            startAt: data.startAt,
            maxApproved: Number(data.maxApproved ?? 0),
            approvedCount: Number(data.approvedCount ?? 0),
          };
        })
        .filter((event) => event.isOpen)
        .sort(
          (a, b) =>
            (a.startAt?.toMillis() ?? 0) -
            (b.startAt?.toMillis() ?? 0)
        );

      setEvents(result);
    } catch (e) {
      console.error(e);
      setError("Kunne ikke hente events.");
    }
  }

  async function loadRegistrations() {
    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      setRegistrations([]);
      return;
    }

    try {
      const q = query(
        collection(db, "registrations"),
        where("uid", "==", firebaseUser.uid)
      );

      const snapshot = await getDocs(q);

      setRegistrations(
        snapshot.docs.map((registrationDoc) => {
          const data = registrationDoc.data();

          return {
            id: registrationDoc.id,
            uid: data.uid,
            eventId: data.eventId,
            eventTitle: data.eventTitle,
            username: data.username,
            phone: data.phone,
            status: data.status,
            createdAt: data.createdAt,
          } as Registration;
        })
      );
    } catch (e) {
      console.error(e);
      setError("Kunne ikke hente dine tilmeldinger.");
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setError("");

      if (!firebaseUser) {
        setUser(null);
        setEvents([]);
        setRegistrations([]);
        setLoading(false);
        return;
      }

      try {
        const userSnapshot = await getDoc(
          doc(db, "users", firebaseUser.uid)
        );

        if (!userSnapshot.exists()) {
          await signOut(auth);
          setUser(null);
          setEvents([]);
          setRegistrations([]);
          setError("Der findes ingen bruger med dette telefonnummer.");
          return;
        }

        const data = userSnapshot.data();

        const profile: UserProfile = {
          uid: firebaseUser.uid,
          username: data.username ?? "Bruger",
          phone: data.phone ?? firebaseUser.phoneNumber ?? "",
          createdAt: data.createdAt,
          isAdmin: data.isAdmin === true,
        };

        setUser(profile);

        await Promise.all([loadEvents(), loadRegistrations()]);
      } catch (e) {
        console.error(e);
        setError("Der opstod en fejl ved login.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  async function sendCode() {
    setError("");
    setMessage("");

    const firebasePhone = toFirebasePhone(phone);

    if (!firebasePhone) {
      setError("Indtast et gyldigt dansk telefonnummer på 8 cifre.");
      return;
    }

    if (creatingUser && !username.trim()) {
      setError("Indtast det brugernavn, du vil bruge i logen.");
      return;
    }

    setSendingCode(true);

    try {
      clearRecaptcha();

      recaptchaVerifier.current = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        { size: "normal" }
      );

      const result = await signInWithPhoneNumber(
        auth,
        firebasePhone,
        recaptchaVerifier.current
      );

      confirmationResult.current = result;

      if (creatingUser) {
        setPendingUsername(username.trim());
      }

      setSmsSent(true);
      setMessage("SMS-koden er sendt.");
    } catch (e: any) {
      console.error(e);

      const code = e?.code ?? "";

      if (code === "auth/too-many-requests") {
        setError(
          "Der er sendt for mange SMS-anmodninger. Vent lidt før du prøver igen."
        );
      } else {
        setError(e?.message ?? "Kunne ikke sende SMS-koden.");
      }

      clearRecaptcha();
    } finally {
      setSendingCode(false);
    }
  }

  async function confirmCode() {
    setError("");
    setMessage("");

    if (!confirmationResult.current) {
      setError("Send først en SMS-kode.");
      return;
    }

    if (!code.trim()) {
      setError("Indtast SMS-koden.");
      return;
    }

    try {
      const credential =
        await confirmationResult.current.confirm(code.trim());

      const firebaseUser = credential.user;
      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnapshot = await getDoc(userRef);

      if (userSnapshot.exists()) {
        if (creatingUser) {
          await signOut(auth);
          setError(
            "Der findes allerede en bruger med dette telefonnummer. Vælg Log ind."
          );
          return;
        }

        const data = userSnapshot.data();

        const profile: UserProfile = {
          uid: firebaseUser.uid,
          username: data.username ?? "Bruger",
          phone: data.phone ?? firebaseUser.phoneNumber ?? "",
          createdAt: data.createdAt,
          isAdmin: data.isAdmin === true,
        };

        setUser(profile);
        setMessage(`Velkommen tilbage, ${profile.username}!`);

        await Promise.all([loadEvents(), loadRegistrations()]);
      } else {
        if (!creatingUser) {
          await signOut(auth);
          setError(
            "Der findes ingen bruger med dette telefonnummer. Opret en bruger først."
          );
          return;
        }

        const finalUsername = pendingUsername.trim();

        if (!finalUsername) {
          await signOut(auth);
          setError("Der mangler et brugernavn.");
          return;
        }

        const profile: UserProfile = {
          uid: firebaseUser.uid,
          username: finalUsername,
          phone: firebaseUser.phoneNumber ?? "",
          createdAt: Timestamp.now(),
          isAdmin: false,
        };

        await setDoc(userRef, profile);

        setUser(profile);
        setMessage(
          `Velkommen ${finalUsername}! Du er nu medlem af logen.`
        );

        await Promise.all([loadEvents(), loadRegistrations()]);
      }

      confirmationResult.current = null;
      clearRecaptcha();
      setCode("");
      setSmsSent(false);
      setPendingUsername("");
    } catch (e) {
      console.error(e);
      setError("SMS-koden er forkert eller udløbet.");
    }
  }

  async function logout() {
    try {
      await signOut(auth);
      setUser(null);
      setEvents([]);
      setRegistrations([]);
      setMessage("Du er logget ud.");
      setError("");
    } catch (e) {
      console.error(e);
      setError("Kunne ikke logge ud.");
    }
  }

  async function registerForEvent(event: EventItem) {
    setError("");
    setMessage("");

    const firebaseUser = auth.currentUser;

    if (!firebaseUser || !user) {
      setError("Du skal være logget ind.");
      return;
    }

    setBusyEvent(event.id);

    const registrationId = `${event.id}_${firebaseUser.uid}`;
    const registrationRef = doc(
      db,
      "registrations",
      registrationId
    );

    try {
      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, "events", event.id);

        const eventSnapshot = await transaction.get(eventRef);

        if (!eventSnapshot.exists()) {
          throw new Error("Eventet findes ikke længere.");
        }

        const eventData = eventSnapshot.data() as EventDoc;

        if (eventData.isOpen !== true) {
          throw new Error("Eventet er ikke længere åbent.");
        }

        const maxApproved = Number(eventData.maxApproved ?? 0);
        const approvedCount = Number(eventData.approvedCount ?? 0);

        if (
          maxApproved > 0 &&
          approvedCount >= maxApproved
        ) {
          throw new Error("Eventet er fuldt booket.");
        }

        const existing = await transaction.get(registrationRef);

        if (existing.exists()) {
          throw new Error(
            "Du er allerede tilmeldt dette event."
          );
        }

        transaction.set(registrationRef, {
          uid: firebaseUser.uid,
          eventId: event.id,
          eventTitle: eventData.title ?? event.title,
          username: user.username,
          phone: firebaseUser.phoneNumber ?? user.phone,
          status: "pending",
          createdAt: Timestamp.now(),
        });
      });

      setMessage(
        `Din tilmelding til "${event.title}" er sendt og afventer godkendelse.`
      );

      await Promise.all([loadEvents(), loadRegistrations()]);
    } catch (e: any) {
      console.error(e);
      setError(
        e?.message ?? "Tilmeldingen kunne ikke gennemføres."
      );
    } finally {
      setBusyEvent(null);
    }
  }

  async function cancelRegistration(
    registration: Registration
  ) {
    if (!auth.currentUser) {
      setError("Du skal være logget ind.");
      return;
    }

    if (
      !window.confirm(
        `Vil du afmelde dig fra "${registration.eventTitle}"?`
      )
    ) {
      return;
    }

    try {
      const registrationRef = doc(
        db,
        "registrations",
        registration.id
      );

      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(registrationRef);

        if (!snapshot.exists()) {
          throw new Error(
            "Tilmeldingen findes ikke længere."
          );
        }

        const data = snapshot.data();

        if (data.uid !== auth.currentUser?.uid) {
          throw new Error(
            "Du kan kun afmelde dine egne tilmeldinger."
          );
        }

        transaction.delete(registrationRef);
      });

      setMessage("Du er nu afmeldt.");
      await Promise.all([loadEvents(), loadRegistrations()]);
    } catch (e: any) {
      console.error(e);
      setError(
        e?.message ?? "Afmeldingen kunne ikke gennemføres."
      );
    }
  }

  function resetLogin() {
    setSmsSent(false);
    setCode("");
    confirmationResult.current = null;
    clearRecaptcha();
    setError("");
    setMessage("");
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={centerStyle}>
          <h1>Saunagus</h1>
          <p>Kontrollerer adgang...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <div style={loginWrapStyle}>
          <div style={loginHeaderStyle}>
            <h1 style={{ margin: 0 }}>Saunagus</h1>
            <div style={logeBadgeStyle}>Privat loge</div>
            <p style={{ color: "#666", marginBottom: 0 }}>
              Du skal være logget ind for at få adgang.
            </p>
          </div>

          <div style={cardStyle}>
            {!smsSent ? (
              <>
                <h2 style={{ marginTop: 0 }}>
                  {creatingUser ? "Opret bruger" : "Log ind"}
                </h2>

                {creatingUser && (
                  <input
                    type="text"
                    placeholder="Dit brugernavn"
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value)
                    }
                    style={inputStyle}
                    autoComplete="nickname"
                  />
                )}

                <input
                  type="tel"
                  placeholder="Telefonnummer"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value)
                  }
                  style={inputStyle}
                  autoComplete="tel"
                />

                <div
                  id="recaptcha-container"
                  style={{ marginBottom: 15 }}
                />

                <button
                  onClick={sendCode}
                  disabled={sendingCode}
                  style={{
                    ...primaryButtonStyle,
                    opacity: sendingCode ? 0.6 : 1,
                  }}
                >
                  {sendingCode
                    ? "Sender..."
                    : "Send SMS-kode"}
                </button>

                <button
                  onClick={() => {
                    setCreatingUser((value) => !value);
                    resetLogin();
                  }}
                  style={secondaryButtonStyle}
                >
                  {creatingUser
                    ? "Jeg har allerede en bruger"
                    : "Opret ny bruger"}
                </button>
              </>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>
                  Indtast SMS-kode
                </h2>

                <p>
                  Vi har sendt en kode til{" "}
                  <strong>{phone}</strong>.
                </p>

                {creatingUser && (
                  <p>
                    Brugernavn:{" "}
                    <strong>{pendingUsername}</strong>
                  </p>
                )}

                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="SMS-kode"
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value.replace(/\D/g, "")
                    )
                  }
                  style={inputStyle}
                  autoComplete="one-time-code"
                />

                <button
                  onClick={confirmCode}
                  style={primaryButtonStyle}
                >
                  {creatingUser
                    ? "Opret bruger"
                    : "Bekræft og log ind"}
                </button>

                <button
                  onClick={resetLogin}
                  style={secondaryButtonStyle}
                >
                  Tilbage
                </button>
              </>
            )}

            {message && (
              <p style={successTextStyle}>{message}</p>
            )}

            {error && (
              <p style={errorTextStyle}>{error}</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <header style={topHeaderStyle}>
        <div>
          <h1 style={{ margin: 0 }}>Saunagus</h1>
          <div style={{ color: "#666", marginTop: 5 }}>
            Velkommen <strong>{user.username}</strong>
          </div>
        </div>

        <button
          onClick={logout}
          style={secondaryButtonStyle}
        >
          Log ud
        </button>
      </header>

      {message && (
        <div style={successBoxStyle}>{message}</div>
      )}

      {error && (
        <div style={errorBoxStyle}>{error}</div>
      )}

      <section style={{ marginBottom: 38 }}>
        <h2>Mine tilmeldinger</h2>

        {registrations.length === 0 ? (
          <div style={cardStyle}>
            Du har ingen tilmeldinger endnu.
          </div>
        ) : (
          registrations.map((registration) => (
            <div
              key={registration.id}
              style={registrationCardStyle}
            >
              <h3 style={{ margin: "0 0 8px" }}>
                {registration.eventTitle}
              </h3>

              <div style={{ marginBottom: 5 }}>
                Status:{" "}
                <strong>
                  {statusText(registration.status)}
                </strong>
              </div>

              {registration.createdAt && (
                <div style={mutedStyle}>
                  Tilmeldt:{" "}
                  {formatDate(registration.createdAt)}
                </div>
              )}

              {registration.status !== "rejected" && (
                <button
                  onClick={() =>
                    cancelRegistration(registration)
                  }
                  style={dangerButtonStyle}
                >
                  Afmeld
                </button>
              )}
            </div>
          ))
        )}
      </section>

      <section>
        <h2>Åbne events</h2>

        {events.length === 0 ? (
          <div style={cardStyle}>
            Der er ingen åbne events lige nu.
          </div>
        ) : (
          events.map((event) => {
            const full =
              event.maxApproved > 0 &&
              event.approvedCount >= event.maxApproved;

            const alreadyRegistered =
              registrations.some(
                (registration) =>
                  registration.eventId === event.id
              );

            const pending =
              registrations.find(
                (registration) =>
                  registration.eventId === event.id
              )?.status === "pending";

            return (
              <div key={event.id} style={eventCardStyle}>
                <div>
                  <h3 style={{ margin: "0 0 8px" }}>
                    {event.title}
                  </h3>

                  {event.startAt && (
                    <div style={eventDateStyle}>
                      {formatDate(event.startAt)}
                    </div>
                  )}

                  <div style={placesStyle}>
                    {event.maxApproved > 0
                      ? `Ledige pladser: ${Math.max(
                          event.maxApproved -
                            event.approvedCount,
                          0
                        )} / ${event.maxApproved}`
                      : "Ledige pladser: Ubegrænset"}
                  </div>
                </div>

                {full ? (
                  <div style={fullStyle}>
                    FULDT BOOKET
                  </div>
                ) : alreadyRegistered ? (
                  <div style={pending
                    ? pendingStyle
                    : approvedStyle
                  }>
                    {pending
                      ? "TILMELDT – AFVENTER GODKENDELSE"
                      : "DU ER TILMELDT"}
                  </div>
                ) : (
                  <button
                    onClick={() =>
                      registerForEvent(event)
                    }
                    disabled={busyEvent === event.id}
                    style={{
                      ...primaryButtonStyle,
                      opacity:
                        busyEvent === event.id
                          ? 0.6
                          : 1,
                    }}
                  >
                    {busyEvent === event.id
                      ? "Tilmelder..."
                      : "Tilmeld mig"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </section>

      {user.isAdmin && (
        <section style={adminSectionStyle}>
          <h2>Administration</h2>
          <div style={cardStyle}>
            <strong>Adminadgang aktiv</strong>
            <p style={mutedStyle}>
              Adminfunktionerne bygges på denne side i næste trin.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  fontFamily:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  background: "#f7f7f7",
  color: "#111",
};

const mainStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "35px 20px 70px",
};

const loginWrapStyle: React.CSSProperties = {
  maxWidth: 520,
  margin: "70px auto",
  padding: 20,
};

const centerStyle: React.CSSProperties = {
  maxWidth: 650,
  margin: "80px auto",
  padding: 20,
  textAlign: "center",
};

const loginHeaderStyle: React.CSSProperties = {
  marginBottom: 25,
};

const topHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 15,
  marginBottom: 25,
};

const logeBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  padding: "5px 10px",
  borderRadius: 999,
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 14,
  padding: 20,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const eventCardStyle: React.CSSProperties = {
  ...cardStyle,
  marginBottom: 14,
};

const registrationCardStyle: React.CSSProperties = {
  ...cardStyle,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 13,
  marginBottom: 12,
  boxSizing: "border-box",
  border: "1px solid #bbb",
  borderRadius: 8,
  fontSize: 16,
  background: "#fff",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: 14,
  marginTop: 8,
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 700,
  background: "#111",
  color: "#fff",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 15px",
  marginTop: 10,
  cursor: "pointer",
  border: "1px solid #bbb",
  borderRadius: 8,
  background: "#fff",
  fontSize: 15,
};

const dangerButtonStyle: React.CSSProperties = {
  marginTop: 14,
  padding: "9px 15px",
  background: "#d32f2f",
  color: "#fff",
  border: "none",
  borderRadius: 7,
  cursor: "pointer",
  fontWeight: 700,
};

const successTextStyle: React.CSSProperties = {
  color: "#19733a",
  fontWeight: 700,
};

const errorTextStyle: React.CSSProperties = {
  color: "#c62828",
  fontWeight: 700,
};

const successBoxStyle: React.CSSProperties = {
  background: "#eaf7ee",
  color: "#176b35",
  border: "1px solid #b7dfc1",
  borderRadius: 10,
  padding: 12,
  marginBottom: 18,
  fontWeight: 700,
};

const errorBoxStyle: React.CSSProperties = {
  background: "#fff0f0",
  color: "#b71c1c",
  border: "1px solid #efb7b7",
  borderRadius: 10,
  padding: 12,
  marginBottom: 18,
  fontWeight: 700,
};

const mutedStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 14,
};

const eventDateStyle: React.CSSProperties = {
  fontSize: 16,
  marginBottom: 10,
};

const placesStyle: React.CSSProperties = {
  fontWeight: 800,
  marginTop: 8,
};

const fullStyle: React.CSSProperties = {
  color: "#c62828",
  fontWeight: 800,
  marginTop: 14,
};

const approvedStyle: React.CSSProperties = {
  color: "#19733a",
  fontWeight: 800,
  marginTop: 14,
};

const pendingStyle: React.CSSProperties = {
  color: "#b26a00",
  fontWeight: 800,
  marginTop: 14,
};

const adminSectionStyle: React.CSSProperties = {
  marginTop: 45,
  paddingTop: 25,
  borderTop: "2px solid #ddd",
};
