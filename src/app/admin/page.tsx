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
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../../lib/firebase";

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

  const [title, setTitle] = useState("Par Saunagus - Nyt event");
  const [maxApproved, setMaxApproved] = useState(8);
  const [isOpen, setIsOpen] = useState(true);
  const [startAt, setStartAt] = useState("");

  const [registrations, setRegistrations] = useState<Registration[]>([]);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setLoggedIn(true);
        loadRegistrations();
      } else {
        setLoggedIn(false);
        setRegistrations([]);
      }
    });

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
      setErr(e?.message ?? "Login mislykkedes.");
    }
  };

  const logout = async () => {
    await signOut(auth);
    setMsg("Logget ud");
    setRegistrations([]);
  };

  const loadRegistrations = async () => {
    try {
      setErr("");

      const snap = await getDocs(
        collection(db, "registrations")
      );

      const data: Registration[] = snap.docs.map((d) => {
        const x = d.data();

        return {
          id: d.id,
          eventId: x.eventId ?? "",
          eventTitle: x.eventTitle ?? "",
          username: x.username ?? "",
          phone: x.phone ?? "",
          status: x.status ?? "pending",
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
      setErr("Indtast en eventtitel.");
      return;
    }

    if (!startAt) {
      setErr("Vælg dato og tidspunkt.");
      return;
    }

    try {
      await addDoc(collection(db, "events"), {
        title: title.trim(),
        isOpen,
        maxApproved: Number(maxApproved),
        approvedCount: 0,
        startAt: new Date(startAt),
        createdAt: serverTimestamp(),
      });

      setMsg("Event oprettet ✓");

      setTitle("Par Saunagus - Nyt event");
      setStartAt("");
    } catch (e: any) {
      setErr(
        e?.message ??
          "Eventet kunne ikke oprettes."
      );
    }
  };

  const changeStatus = async (
    registration: Registration,
    status: "approved" | "rejected"
  ) => {
    setMsg("");
    setErr("");

    try {
      await updateDoc(
        doc(db, "registrations", registration.id),
        {
          status,
        }
      );

      await loadRegistrations();

      if (status === "approved") {
        setMsg("Tilmelding godkendt ✓");
      } else {
        setMsg("Tilmelding afvist.");
      }
    } catch (e: any) {
      setErr(
        e?.message ??
          "Status kunne ikke ændres."
      );
    }
  };

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "30px 20px",
        fontFamily: "system-ui",
      }}
    >
      <h1>PAR SAUNAGUS</h1>

      {msg && (
        <div
          style={{
            padding: 12,
            marginBottom: 15,
            background: "#e8f5e9",
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
            background: "#ffebee",
            color: "#b71c1c",
            borderRadius: 8,
          }}
        >
          {err}
        </div>
      )}

      {!loggedIn ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <h2>Admin login</h2>

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
              boxSizing: "border-box",
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
              boxSizing: "border-box",
            }}
          />

          <button
            onClick={login}
            style={{
              padding: "12px 20px",
              cursor: "pointer",
            }}
          >
            Log ind
          </button>
        </section>
      ) : (
        <>
          <button
            onClick={logout}
            style={{
              padding: "10px 18px",
              marginBottom: 25,
              cursor: "pointer",
            }}
          >
            Log ud
          </button>

          <section
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 20,
              marginBottom: 30,
            }}
          >
            <h2>Opret event</h2>

            <input
              type="text"
              placeholder="Eventtitel"
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
              style={{
                width: "100%",
                padding: 12,
                marginBottom: 10,
                boxSizing: "border-box",
              }}
            />

            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) =>
                setStartAt(e.target.value)
              }
              style={{
                width: "100%",
                padding: 12,
                marginBottom: 10,
                boxSizing: "border-box",
              }}
            />

            <label>
              Antal pladser:
            </label>

            <input
              type="number"
              min="1"
              value={maxApproved}
              onChange={(e) =>
                setMaxApproved(
                  Number(e.target.value)
                )
              }
              style={{
                width: "100%",
                padding: 12,
                marginBottom: 10,
                boxSizing: "border-box",
              }}
            />

            <label>
              <input
                type="checkbox"
                checked={isOpen}
                onChange={(e) =>
                  setIsOpen(e.target.checked)
                }
              />{" "}
              Åben for tilmelding
            </label>

            <br />
            <br />

            <button
              onClick={createEvent}
              style={{
                padding: "12px 20px",
                cursor: "pointer",
              }}
            >
              Opret event
            </button>
          </section>

          <section>
            <h2>Tilmeldinger</h2>

            <button
              onClick={loadRegistrations}
              style={{
                padding: "10px 18px",
                marginBottom: 15,
                cursor: "pointer",
              }}
            >
              Opdater
            </button>

            {registrations.length === 0 ? (
              <p>
                Ingen tilmeldinger.
              </p>
            ) : (
              registrations.map(
                (registration) => (
                  <div
                    key={registration.id}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      padding: 15,
                      marginBottom: 10,
                    }}
                  >
                    <h3
                      style={{
                        marginTop: 0,
                      }}
                    >
                      {registration.username}
                    </h3>

                    <div>
                      <strong>Event:</strong>{" "}
                      {registration.eventTitle}
                    </div>

                    <div>
                      <strong>Telefon:</strong>{" "}
                      {registration.phone}
                    </div>

                    <div>
                      <strong>Status:</strong>{" "}
                      {registration.status}
                    </div>

                    {registration.status ===
                      "pending" && (
                      <div
                        style={{
                          marginTop: 15,
                        }}
                      >
                        <button
                          onClick={() =>
                            changeStatus(
                              registration,
                              "approved"
                            )
                          }
                          style={{
                            padding:
                              "10px 15px",
                            marginRight: 10,
                            cursor:
                              "pointer",
                          }}
                        >
                          Godkend
                        </button>

                        <button
                          onClick={() =>
                            changeStatus(
                              registration,
                              "rejected"
                            )
                          }
                          style={{
                            padding:
                              "10px 15px",
                            cursor:
                              "pointer",
                          }}
                        >
                          Afvis
                        </button>
                      </div>
                    )}
                  </div>
                )
              )
            )}
          </section>
        </>
      )}
    </main>
  );
}
