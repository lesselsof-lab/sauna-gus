"use client";

import { useState } from "react";
import styles from "../page.module.css";

import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// ✅ RELATIV IMPORT (IKKE @/...)
import { auth, db } from "../../lib/firebase";

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [title, setTitle] = useState("Sauna-gus – Nyt event");
  const [maxApproved, setMaxApproved] = useState(5);
  const [isOpen, setIsOpen] = useState(true);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const login = async () => {
    setMsg("");
    setErr("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setMsg("Logget ind ✅");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const logout = async () => {
    await signOut(auth);
    setMsg("Logget ud");
  };

  const createEvent = async () => {
    setMsg("");
    setErr("");

    try {
      await addDoc(collection(db, "events"), {
        title,
        maxApproved: Number(maxApproved),
        approvedCount: 0,
        isOpen,
        createdAt: serverTimestamp(),
      });

      setMsg("Event oprettet ✅");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.h1}>Admin</h1>

        {err && <div className={styles.errorBox}>{err}</div>}
        {msg && <div className={styles.okBox}>{msg}</div>}

        <div className={styles.card}>
          <h2 className={styles.h2}>Login</h2>
          <input
            className={styles.input}
            placeholder="Admin e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={styles.input}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className={styles.primaryBtn} onClick={login}>
            Log ind
          </button>
          <button className={styles.secondaryBtn} onClick={logout}>
            Log ud
          </button>
        </div>

        <div className={styles.card}>
          <h2 className={styles.h2}>Opret event</h2>

          <input
            className={styles.input}
            placeholder="Titel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <input
            className={styles.input}
            placeholder="Max pladser"
            type="number"
            value={maxApproved}
            onChange={(e) => setMaxApproved(Number(e.target.value))}
          />

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={isOpen}
              onChange={(e) => setIsOpen(e.target.checked)}
            />
            Åben for tilmelding (isOpen)
          </label>

          <button className={styles.primaryBtn} onClick={createEvent}>
            Opret
          </button>
        </div>
      </div>
    </main>
  );
}
