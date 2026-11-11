"use client";

import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) window.location.href = "/";
    else {
      setError("That password is not right.");
      setBusy(false);
    }
  }

  return (
    <main className="shell login">
      <h1>Foundations</h1>
      <form onSubmit={submit} className="card stack">
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy || !password}>{busy ? "Signing in" : "Sign in"}</button>
      </form>
    </main>
  );
}
