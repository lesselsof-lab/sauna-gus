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
          // A phone login without a profile is not allowed into the loge.
          await signOut(auth);
          setUser(null);
          setEvents([]);
          setRegistrations([]);
          setError("Der findes ingen bruger med dette telefonnummer.");
          return;
        }

        const data = userSnapshot.data();

        setUser({
          uid: firebaseUser.uid,
          username: data.username,
          phone: data.phone,
          createdAt: data.createdAt,
        });

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
      if (creatingUser) setPendingUsername(username.trim());

      setSmsSent(true);
      setMessage("SMS-koden er sendt.");
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Kunne ikke sende SMS-koden.");
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
      const credential = await confirmationResult.current.confirm(code.trim());
      const firebaseUser = credential.user;
      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnapshot = await getDoc(userRef);

      if (userSnapshot.exists()) {
        if (creatingUser) {
          await signOut(auth);
          setError("Der findes allerede en bruger med dette telefonnummer. Vælg Log ind.");
          return;
        }

        const data = userSnapshot.data();
        const profile: UserProfile = {
          uid: firebaseUser.uid,
          username: data.username,
          phone: data.phone ?? firebaseUser.phoneNumber ?? "",
          createdAt: data.createdAt,
        };

        setUser(profile);
        setMessage(`Velkommen tilbage, ${profile.username}!`);
        await Promise.all([loadEvents(), loadRegistrations()]);
      } else {
        if (!creatingUser) {
          await signOut(auth);
          setError("Der findes ingen bruger med dette telefonnummer. Opret en bruger først.");
          return;
        }

        const finalUsername = pendingUsername.trim();

        if (!finalUsername) {
          await signOut(auth);
          setError("Der mangler et brugernavn.");
          return;
        }

        // Vigtigt: ingen søgning i users-samlingen.
        // Det undgår den tidligere permission-fejl.
        const profile: UserProfile = {
          uid: firebaseUser.uid,
          username: finalUsername,
          phone: firebaseUser.phoneNumber ?? "",
          createdAt: Timestamp.now(),
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
    } catch (e: any) {
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

        if (maxApproved > 0 && approvedCount >= maxApproved) {
          throw new Error("Eventet er fuldt booket.");
        }

        const existing = await transaction.get(registrationRef);

        if (existing.exists()) {
          throw new Error("Du er allerede tilmeldt dette event.");
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
    }
  }

  async function cancelRegistration(registration: Registration) {
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
          throw new Error("Tilmeldingen findes ikke længere.");
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
      setError(e?.message ?? "Afmeldingen kunne ikke gennemføres.");
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

  // ALT før login er skjult. Ingen events hentes eller vises for gæster.
  if (!user) {
    return (
      <main style={pageStyle}>
        <div style={loginWrapStyle}>
          <div style={headerStyle}>
            <h1 style={{ fontSize: 38, marginBottom: 8 }}>
              Saunagus
            </h1>
            <p style={{ fontWeight: 600, margin: 0 }}>
              Privat loge
            </p>
            <p style={{ color: "#666" }}>
              Du skal være logget ind for at få adgang.
            </p>
          </div>

          <div style={cardStyle}>
            {!smsSent ? (
              <>
                <h2>{creatingUser ? "Opret bruger" : "Log ind"}</h2>

                {creatingUser && (
                  <input
                    type="text"
                    placeholder="Dit brugernavn"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    style={inputStyle}
                    autoComplete="nickname"
                  />
                )}

                <input
                  type="tel"
                  placeholder="Telefonnummer"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
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
                  style={primaryButtonStyle}
                >
                  {sendingCode ? "Sender..." : "Send SMS-kode"}
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
                <h2>Indtast SMS-kode</h2>
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
                    setCode(e.target.value.replace(/\D/g, ""))
                  }
                  style={inputStyle}
                  autoComplete="one-time-code"
                />

                <button
                  onClick={confirmCode}
                  style={primaryButtonStyle}
                >
                  {creatingUser ? "Opret bruger" : "Bekræft og log ind"}
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
              <p style={{ color: "green", fontWeight: 700 }}>
                {message}
              </p>
            )}

            {error && (
              <p style={{ color: "crimson", fontWeight: 700 }}>
                {error}
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Saunagus</h1>
          <div style={{ color: "#666" }}>
            Velkommen <strong>{user.username}</strong>
          </div>
        </div>

        <button onClick={logout} style={secondaryButtonStyle}>
          Log ud
        </button>
      </header>

      {message && (
        <p style={{ color: "green", fontWeight: 700 }}>
          {message}
        </p>
      )}

      {error && (
        <p style={{ color: "crimson", fontWeight: 700 }}>
          {error}
        </p>
      )}

      <section style={{ marginBottom: 35 }}>
        <h2>Mine tilmeldinger</h2>

        {registrations.length === 0 ? (
          <div style={cardStyle}>
            Du har ingen tilmeldinger endnu.
          </div>
        ) : (
          registrations.map((registration) => (
            <div key={registration.id} style={itemStyle}>
              <strong>{registration.eventTitle}</strong>

              <div style={{ marginTop: 7 }}>
                Status:{" "}
                <strong>
                  {registration.status === "approved"
                    ? "Godkendt"
                    : registration.status === "pending"
                    ? "Afventer godkendelse"
                    : "Afvist"}
                </strong>
              </div>

              {registration.status !== "rejected" && (
                <button
                  onClick={() => cancelRegistration(registration)}
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

            const alreadyRegistered = registrations.some(
              (registration) => registration.eventId === event.id
            );

            return (
              <div key={event.id} style={itemStyle}>
                <h3 style={{ margin: "0 0 6px" }}>
                  {event.title}
                </h3>

                {event.startAt && (
                  <div>{formatDate(event.startAt)}</div>
                )}

                <div style={{ marginTop: 8, fontWeight: 700 }}>
                  Pladser: {event.approvedCount} / {event.maxApproved}
                </div>

                {full ? (
                  <div style={fullStyle}>FULDT BOOKET</div>
                ) : alreadyRegistered ? (
                  <div style={approvedStyle}>
                    Du er allerede tilmeldt
                  </div>
                ) : (
                  <button
                    onClick={() => registerForEvent(event)}
                    style={primaryButtonStyle}
                  >
                    Tilmeld mig
                  </button>
                )}
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  fontFamily: "system-ui, sans-serif",
  background: "#fff",
};

const mainStyle: React.CSSProperties = {
  maxWidth: 700,
  margin: "40px auto",
  padding: "0 20px 60px",
  fontFamily: "system-ui, sans-serif",
};

const loginWrapStyle: React.CSSProperties = {
  maxWidth: 500,
  margin: "70px auto",
  padding: 25,
};

const centerStyle: React.CSSProperties = {
  maxWidth: 650,
  margin: "80px auto",
  padding: 20,
  textAlign: "center",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 15,
  marginBottom: 30,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 20,
};

const itemStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 18,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  marginBottom: 12,
  boxSizing: "border-box",
  border: "1px solid #bbb",
  borderRadius: 5,
  fontSize: 16,
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: 13,
  marginTop: 4,
  border: "none",
  borderRadius: 5,
  cursor: "pointer",
  fontSize: 16,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 15px",
  marginTop: 10,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "9px 15px",
  background: "#d32f2f",
  color: "white",
  border: "none",
  borderRadius: 5,
  cursor: "pointer",
};

const fullStyle: React.CSSProperties = {
  color: "crimson",
  fontWeight: 700,
  marginTop: 8,
};

const approvedStyle: React.CSSProperties = {
  color: "green",
  fontWeight: 700,
  marginTop: 8,
};
