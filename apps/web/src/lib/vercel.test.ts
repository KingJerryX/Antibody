import { expect, it } from "vitest";
import { sitesFrom } from "./vercel.ts";

it("imports only verified, non-redirect domains, with the repo each project deploys from", () => {
  const sites = sitesFrom([
    {
      project: { id: "p1", name: "notes", link: { type: "github", org: "octo", repo: "notes" } },
      domains: [
        { name: "notes-octo.vercel.app", verified: true },
        { name: "Notes.example.com", verified: true },
        { name: "www.notes.example.com", verified: true, redirect: "notes.example.com" },
        // Anyone can type someone else's domain into their project; Vercel leaves it unverified.
        { name: "bank.example", verified: false },
      ],
    },
    { project: { id: "p2", name: "landing" }, domains: [{ name: "landing.vercel.app", verified: true }] },
  ]);
  expect(sites).toEqual([
    { host: "notes-octo.vercel.app", repo: "octo/notes", vercelProject: "notes" },
    { host: "notes.example.com", repo: "octo/notes", vercelProject: "notes" },
    { host: "landing.vercel.app", repo: undefined, vercelProject: "landing" },
  ]);
});
