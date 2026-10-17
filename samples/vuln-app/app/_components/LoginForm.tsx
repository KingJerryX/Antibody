"use client";

import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("alice.patel1@example.com");
  const [password, setPassword] = useState("password123");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setMsg(res.ok ? "Signed in" : `Login failed (${res.status})`);
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h2>Sign in</h2>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
      />
      <button type="submit">Sign in</button>
      {msg && <span className="reply">{msg}</span>}
    </form>
  );
}
