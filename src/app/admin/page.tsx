"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  addDoc,
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

  const [title, setTitle] = useState("Saunagus - Nyt event");
  const [maxApproved, setMaxApproved] = useState(5);
  const [isOpen, setIsOpen] = useState(true);
  const [startAt, setStartAt] = useState("");

  const [registrations, setRegistrations] = useState<Registration[]>([]);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const login = async () => {
    setMsg("");
    setErr("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setMsg("Logget ind ✓");
      await loadRegistrations();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const logout = async () => {
    await signOut(auth);
    setMsg("Logget ud");
    setRegistrations([]);
  };

  const createEvent = async () => {
    setMsg("");
    setErr("");

    if (!title.trim()) {
      setErr("Indtast en titel.");
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
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const loadRegistrations = async () => {
    try {
      const snap = await getDocs(collection(db, "registrations"));

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
      setErr(e?.message ?? String(e));
    }
  };

  const changeStatus = async (
    registration: Registration,
    status: "approved" | "rejected"
  ) => {
    setMsg("");
    setErr("");

    try {
      await updateDoc(doc(db, "registrations", registration.id), {
        status,
      });

      await loadRegistrations();

      setMsg(
        status === "approved"
          ? "Tilmelding godkendt ✓"
          : "Tilmelding afvist."
      );
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  useEffect(() => {
    loadRegistrations();
  }, []);

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "40px auto",
        padding: "0 20px",
        fontFamily: "system-ui",
      }}
    >
      <h1>Saunagus – Admin</h1>

      {msg && (
        <p style={{ color: "green", fontWeight: "bold" }}>
          {msg}
        </p>
      )}

      {err && (
        <p style={{ color: "crimson" }}>
          {err}
        </p>
      )}

      <hr />

      <h2>Admin login</h2>

      <input
        type="email"
        placeholder="Admin e-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          width: "100%",
          padding: 10,
          marginBottom: 10,
          boxSizing: "border-box",
        }}
      />

      <input
        type="password"
        placeholder="Adgangskode"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          width: "100%",
          padding: 10,
          marginBottom: 10,
          boxSizing: "border-box",
        }}
      />

      <button
        onClick={login}
        style={{
          padding: "10px 20px",
          marginRight: 10,
          cursor: "pointer",
        }}
      >
        Log ind
      </button>

      <button
        onClick={logout}
        style={{
          padding: "10px 20px",
          cursor: "pointer",
        }}
      >
        Log ud
      </button>

      <hr />

      <h2>Opret event</h2>

      <input
        type="text"
        placeholder="Event titel"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{
          width: "100%",
          padding: 10,
          marginBottom: 10,
          boxSizing: "border-box",
        }}
      />

      <input
        type="datetime-local"
        value={startAt}
        onChange={(e) => setStartAt(e.target.value)}
        style={{
          width: "100%",
          padding: 10,
          marginBottom: 10,
          boxSizing: "border-box",
        }}
      />

      <input
        type="number"
        min="1"
        value={maxApproved}
        onChange={(e) => setMaxApproved(Number(e.target.value))}
        style={{
          width: "100%",
          padding: 10,
          marginBottom: 10,
          boxSizing: "border-box",
        }}
      />

      <label>
        <input
          type="checkbox"
          checked={isOpen}
          onChange={(e) => setIsOpen(e.target.checked)}
        />{" "}
        Åbent for tilmeldinger
      </label>

      <br />
      <br />

      <button
        onClick={createEvent}
        style={{
          padding: "10px 20px",
          cursor: "pointer",
        }}
      >
        Opret event
      </button>

      <hr />

      <h2>Tilmeldinger</h2>

      <button
        onClick={loadRegistrations}
        style={{
          padding: "8px 15px",
          marginBottom: 15,
          cursor: "pointer",
        }}
      >
        Opdater
      </button>

      {registrations.length === 0 ? (
        <p>Ingen tilmeldinger.</p>
      ) : (
        registrations.map((registration) => (
          <div
            key={registration.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 15,
              marginBottom: 10,
            }}
          >
            <strong>{registration.eventTitle}</strong>

            <div>Brugernavn: {registration.username}</div>
            <div>Telefon: {registration.phone}</div>
            <div>Status: {registration.status}</div>

            {registration.status === "pending" && (
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() =>
                    changeStatus(registration, "approved")
                  }
                  style={{
                    padding: "8px 15px",
                    marginRight: 10,
                    cursor: "pointer",
                  }}
                >
                  Godkend
                </button>

                <button
                  onClick={() =>
                    changeStatus(registration, "rejected")
                  }
                  style={{
                    padding: "8px 15px",
                    cursor: "pointer",
                  }}
                >
                  Afvis
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </main>
  );
}
