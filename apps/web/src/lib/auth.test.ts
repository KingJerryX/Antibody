import { expect, it } from "vitest";
import { projectIdFor, safeNext, sign, unsign } from "./auth.ts";

it("accepts its own signed values and rejects tampered or expired ones", () => {
  const token = sign({ id: 42, login: "octo" });
  expect(unsign<{ id: number }>(token)?.id).toBe(42);

  const [body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ id: 1, login: "admin", exp: Date.now() + 1e9 })).toString("base64url");
  expect(unsign(`${forged}.${mac}`)).toBeUndefined();
  expect(unsign(`${body}.${mac.slice(0, -2)}xx`)).toBeUndefined();
  expect(unsign(undefined)).toBeUndefined();

  const old = sign({ id: 42, login: "octo" }, 60, Date.now() - 120_000);
  expect(unsign(old)).toBeUndefined();
});

it("only follows same-site paths after sign-in", () => {
  expect(safeNext("/connect/proj_x")).toBe("/connect/proj_x");
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "", null]) expect(safeNext(bad)).toBe("/sites");
});

it("gives each signed-in owner their own project per site", () => {
  expect(projectIdFor("App.vercel.app")).toBe("proj_app-vercel-app");
  expect(projectIdFor("app.vercel.app", { id: 7, login: "a" })).toBe("proj_app-vercel-app-u7");
});
