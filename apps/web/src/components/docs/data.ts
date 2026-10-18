export interface DocStep {
  id: string;
  n: string;
  name: string;
  /** Short line under the name in the left nav. */
  nav: string;
  /** One sentence on the overview. */
  line: string;
  title: string;
  body: string;
  note: string;
  noteText: string;
}

export const STEPS: DocStep[] = [
  {
    id: "paste",
    n: "01",
    name: "Paste",
    nav: "A URL",
    line: "You give Antibody a URL.",
    title: "You give Antibody a URL.",
    body: "That address is the start. A domain you have not verified gets a read-only look. Active checks run only after you prove the site is yours.",
    note: "Read-only until you prove it.",
    noteText: "Proof is Connect Vercel, or the allowlist. Until then, Antibody does not call the API.",
  },
  {
    id: "scan",
    n: "02",
    name: "Scan",
    nav: "Open doors",
    line: "Open doors light up.",
    title: "It looks at the app the way a visitor does.",
    body: "Antibody reads the page and the JavaScript that shipped with it. A key left in that bundle shows up. So does a database that answers anyone, and an admin route that works with no login.",
    note: "The catalog is the same list as a report.",
    noteText: "Each row on a report is one check.",
  },
  {
    id: "fix",
    n: "03",
    name: "Fix",
    nav: "You approve",
    line: "A patch waits for you.",
    title: "The patch sits until you say yes.",
    body: "Antibody writes a change from what the scan found. The checks run against that change. Nothing merges on its own. You approve it on the site, or by text.",
    note: "Nothing merges on its own.",
    noteText: "The patch waits. Approving it on the site and replying YES by text do the same thing.",
  },
  {
    id: "shield",
    n: "04",
    name: "Shield",
    nav: "Live requests",
    line: "The bad request stops.",
    title: "Ordinary visits go through. A dump does not.",
    body: "Each request is scored before the route runs. A normal page load is allowed. A request that tries to take the whole table is blocked. If the scorer cannot be reached, the request is still allowed.",
    note: "A quiet scorer fails open.",
    noteText: "If Antibody cannot score the request, the visit is allowed. Blocking waits for a score.",
  },
  {
    id: "text",
    n: "05",
    name: "Text",
    nav: "Reply YES",
    line: "You reply YES.",
    title: "One message. You reply YES.",
    body: "When a fix is ready, or an attack was blocked, Antibody texts you. The reply that approves a fix is YES, with the fix id. If a text is not enough, it can call.",
    note: "The reply is YES and the fix id.",
    noteText: "YES fix_18a approves that fix. A bare YES does not name which one.",
  },
];
