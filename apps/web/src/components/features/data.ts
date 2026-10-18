export interface CheckItem {
  title: string;
  why: string;
  how: string;
}

export interface CheckGroup {
  id: string;
  label: string;
  /** Short name for the left nav. */
  nav: string;
  count: number;
  when: string;
  items: CheckItem[];
}

export const GROUPS: CheckGroup[] = [
  {
    id: "visitor",
    label: "Any URL",
    nav: "Any URL",
    count: 10,
    when: "Runs on every scan. Uses the page, its scripts, and public DNS.",
    items: [
      {
        title: "Served over HTTPS",
        why: "Passwords, cookies, and form data stay unreadable on the network.",
        how: "The URL has to be https. A local address is allowed to skip this.",
      },
      {
        title: "No secret keys in the page or its scripts",
        why: "A key in the bundle can be copied by anyone who loads the site.",
        how: "The HTML and same-origin JavaScript are scanned for API keys, tokens, database URLs, and private keys.",
      },
      {
        title: "Browser protection headers are set",
        why: "These headers stop clickjacking, file-type sniffing, and a later drop back to HTTP.",
        how: "The response needs X-Frame-Options or frame-ancestors, X-Content-Type-Options, and Strict-Transport-Security.",
      },
      {
        title: "Content Security Policy is enforced",
        why: "The browser only runs scripts the policy allows.",
        how: "A missing policy fails. A report-only policy fails too, because it logs the script and still lets it run.",
      },
      {
        title: "DNSSEC signs this domain",
        why: "A signed answer cannot be quietly swapped for a fake site.",
        how: "A public resolver must authenticate the name. No DS record is a low finding. A DS record that fails validation is a medium finding. Localhost and raw IPs skip this.",
      },
      {
        title: "DMARC rejects forged email",
        why: "Mail servers need a rule for messages that fake this domain.",
        how: "p=reject and p=quarantine pass. No record, p=none, and pct=0 do not. The lookup checks this host, then the parent domain.",
      },
      {
        title: "No insecure resources on a secure page",
        why: "An HTTP file on an HTTPS page can be swapped, and the swap runs inside the site.",
        how: "Scripts, frames, and forms on an HTTPS page must themselves be HTTPS.",
      },
      {
        title: "Cookies are Secure and HttpOnly",
        why: "The session should be unreadable to page scripts and unsendable on plain HTTP.",
        how: "Session cookies need HttpOnly and SameSite. Every cookie on an HTTPS site needs Secure.",
      },
      {
        title: "Source code isn't published",
        why: "A source map is the original code. A directory listing is every file the server is willing to show.",
        how: "Public .map files and an Index of / page are both findings.",
      },
      {
        title: "No tokens or risky code in the browser scripts",
        why: "Anything stored where page scripts can read it is one bug away from account theft.",
        how: "The scan flags tokens in localStorage or document.cookie, a URL written into HTML, raw HTML insertion, postMessage to any site, and a ws:// socket on HTTPS.",
      },
    ],
  },
  {
    id: "live",
    label: "After you prove ownership",
    nav: "Ownership",
    count: 6,
    when: "These call the API with no login. They wait until you connect the Vercel project, or the host is on the allowlist.",
    items: [
      {
        title: "Supabase tables are locked",
        why: "A public key plus row-level security off is a full download of the table.",
        how: "If the page ships a Supabase key, a few common tables are asked for rows. The Supabase host is probed only when that host is verified too.",
      },
      {
        title: "Admin and user data need a login",
        why: "An admin path that returns JSON, or a user id that returns someone else, is an open door.",
        how: "Fixed admin paths and API paths named in the scripts are requested with no session. Numbered user URLs that each return a different person are an IDOR.",
      },
      {
        title: "Login, signup, and AI endpoints are rate limited",
        why: "An unlimited chat route runs up the AI bill. An unlimited login is password guessing. An unlimited signup is account spam.",
        how: "25 posts go to /api/chat, /api/login, and /api/signup. The check looks for a 429. A route that does not exist is ignored.",
      },
      {
        title: "No .env, .git, or credential files are served",
        why: "Those files are the secrets and the source, sitting on the open web.",
        how: "The scan requests .env, .git, AWS credentials, and wp-config.php. The report records that the file answered and leaves the body out.",
      },
      {
        title: "Other websites can't call your API as your users",
        why: "A reflected Origin plus credentials lets a malicious page read logged-in responses.",
        how: "The homepage is requested with a foreign Origin. Reflecting it, with credentials allowed, is a finding.",
      },
      {
        title: "GraphQL isn't open to anyone",
        why: "An open introspection query is a map of the API, and often of the data behind it.",
        how: "POST /graphql with a schema query and no login must not return the schema.",
      },
    ],
  },
  {
    id: "code",
    label: "Connected GitHub repo",
    nav: "Repo",
    count: 6,
    when: "These read source. They wait until the site's repo is connected.",
    items: [
      {
        title: "No secret keys written into the code",
        why: "A committed key is one push away from the public bundle.",
        how: "The repo is scanned for the same key shapes the URL scan looks for in JavaScript.",
      },
      {
        title: "Every API route checks who's asking",
        why: "A route that returns data before it checks the session is the source of an open admin path.",
        how: "Routes that load a record by the id in the URL, and never check the owner, are the source of an IDOR.",
      },
      {
        title: "AI routes are rate limited",
        why: "The live probe can only see three paths. The repo can see the route you actually wrote.",
        how: "An AI route with no limiter in the source is a finding.",
      },
      {
        title: "Webhooks check their signature",
        why: "An unsigned webhook accepts an event anyone can forge, including payments and account changes.",
        how: "The handler has to verify the signature before it trusts the body.",
      },
      {
        title: "No raw HTML or SQL built from user input",
        why: "String-built SQL is injection. HTML built from a comment or the URL runs as script.",
        how: "The source is checked for SQL and HTML assembled from user input.",
      },
      {
        title: "No private data sent to the browser",
        why: "A secret, a password, a stack trace, or another person's row does not belong in the response.",
        how: "The review flags private values written into a response or a render.",
      },
    ],
  },
];

export const DEDUCTIONS = [
  { label: "Critical finding", points: 35, tone: "risk" },
  { label: "High finding", points: 20, tone: "risk" },
  { label: "Medium finding", points: 8, tone: "work" },
  { label: "Low finding", points: 3, tone: "work" },
  { label: "Live checks did not run", points: 15, tone: "skip" },
] as const;

export interface ScorePart {
  label: string;
  points: number;
  tone: "keep" | "risk" | "work" | "skip";
}

export interface ScoreExample {
  name: string;
  score: number;
  tone: "strong" | "work" | "risk";
  parts: ScorePart[];
}

/** Each example sums to 100. Widths in the stacked bar are these point values. */
export const EXAMPLES: ScoreExample[] = [
  {
    name: "Homepage only, nothing found",
    score: 85,
    tone: "strong",
    parts: [
      { label: "Remaining", points: 85, tone: "keep" },
      { label: "Live checks did not run", points: 15, tone: "skip" },
    ],
  },
  {
    name: "Homepage only, one low finding",
    score: 82,
    tone: "work",
    parts: [
      { label: "Remaining", points: 82, tone: "keep" },
      { label: "Low finding", points: 3, tone: "work" },
      { label: "Live checks did not run", points: 15, tone: "skip" },
    ],
  },
  {
    name: "Critical and high, live checks ran",
    score: 45,
    tone: "risk",
    parts: [
      { label: "Remaining", points: 45, tone: "keep" },
      { label: "Critical finding", points: 35, tone: "risk" },
      { label: "High finding", points: 20, tone: "risk" },
    ],
  },
];

/** Integer scores in each band: 0–54, 55–84, 85–100. */
export const BANDS = [
  { label: "At risk", range: "0–54", span: 55, tone: "risk" },
  { label: "Needs work", range: "55–84", span: 30, tone: "work" },
  { label: "Strong", range: "85–100", span: 16, tone: "strong" },
] as const;
