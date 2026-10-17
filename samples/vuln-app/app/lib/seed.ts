// 50 fake users for the "NoteNest" demo. All emails are @example.com and all data is invented.
// ponytail: generated in-process, no DB. Resets every restart — fine for a demo.

export interface Note {
  id: number;
  title: string;
  body: string;
  tag?: string;
  updatedAt?: string;
  pinned?: boolean;
}

// The signed-in demo user (Alice) gets a realistic workspace; everyone else gets a few short notes.
const DEMO_NOTES: Note[] = [
  {
    id: 1,
    title: "Q4 launch checklist",
    tag: "work",
    pinned: true,
    updatedAt: "2026-10-16T21:40:00Z",
    body: "Ship the onboarding flow by Friday.\n\n- Finish pricing page copy\n- QA the Stripe checkout\n- Record the 60s demo video\n- Email the beta list (412 people)\n\nBlocked on: final logo from Sam.",
  },
  {
    id: 2,
    title: "Standup: Thursday",
    tag: "work",
    updatedAt: "2026-10-16T14:05:00Z",
    body: "Yesterday: shipped login and the AI summaries.\nToday: notes sharing, then fix the slow search.\nBlockers: none, just need coffee.",
  },
  {
    id: 3,
    title: "Lisbon trip",
    tag: "travel",
    pinned: true,
    updatedAt: "2026-10-15T09:12:00Z",
    body: "Flights booked (TAP, Nov 14 to 19).\n\nStay: somewhere in Alfama with a view.\nEat: Time Out Market, pasteis at Manteigaria, sardines anywhere.\nDay trip to Sintra on the Saturday.",
  },
  {
    id: 4,
    title: "Book ideas",
    tag: "personal",
    updatedAt: "2026-10-12T22:31:00Z",
    body: "A novel where the AI is the landlord and keeps raising the rent based on your search history.\n\nShort story: two notes apps fall in love through a sync conflict.",
  },
  {
    id: 5,
    title: "Grocery list",
    tag: "personal",
    updatedAt: "2026-10-11T18:20:00Z",
    body: "- oat milk\n- eggs\n- coffee beans (the good ones)\n- sourdough\n- basil, tomatoes, burrata",
  },
  {
    id: 6,
    title: "API keys (temp)",
    tag: "work",
    updatedAt: "2026-10-09T11:02:00Z",
    body: "stripe test key sk_test_abc... (move to env!)\nopenai key is in the frontend for now, will fix after launch",
  },
];

export interface User {
  id: number;
  name: string;
  email: string;
  // VULN: plaintext passwords (no hashing). Here to power the credential-stuffing demo.
  password: string;
  bio: string;
  plan: "free" | "pro";
  createdAt: string;
  notes: Note[];
}

const FIRST = [
  "Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi", "Ivan", "Judy",
  "Mallory", "Niaj", "Olivia", "Peggy", "Rupert", "Sybil", "Trent", "Uma", "Victor", "Wendy",
  "Xavier", "Yara", "Zane", "Nina", "Omar",
];
const LAST = [
  "Nguyen", "Patel", "Kim", "Garcia", "Chen", "Smith", "Okafor", "Rossi", "Haddad", "Novak",
];
const NOTE_TITLES = [
  "Grocery list", "Standup notes", "Book ideas", "Trip to Lisbon", "Tax reminders",
  "Workout plan", "Birthday gifts", "API keys (temp)", "Passwords to rotate", "Therapy notes",
];
const NOTE_BODIES = [
  "milk, eggs, coffee, the good bread",
  "shipped the login flow, blocked on the API key",
  "a novel where the AI is the landlord",
  "flights booked, need a place in Alfama",
  "quarterly estimate due the 15th",
  "3x5 squats, run on tuesdays",
  "headphones for sam, a plant for mom",
  "stripe test key sk_test_abc... (move to env!)",
  "the bank one and the old email one",
  "small steps are still steps",
];

// Deterministic so the demo is reproducible run to run.
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

export const USERS: User[] = Array.from({ length: 50 }, (_, idx) => {
  const id = idx + 1;
  const first = pick(FIRST, idx);
  const last = pick(LAST, idx * 3 + 1);
  const name = `${first} ${last}`;
  const email = `${first.toLowerCase()}.${last.toLowerCase()}${id}@example.com`;
  const noteCount = (idx % 3) + 1;
  const notes: Note[] = Array.from({ length: noteCount }, (_, n) => ({
    id: n + 1,
    title: pick(NOTE_TITLES, idx + n),
    body: pick(NOTE_BODIES, idx + n),
  }));
  return {
    id,
    name,
    email,
    // VULN: weak, guessable, plaintext. The first user is the "known good" login for demos.
    password: id === 1 ? "password123" : `pw_${first.toLowerCase()}_${id}`,
    bio: `${first} keeps notes on NoteNest. ${pick(["Coffee first.", "Runner.", "Dog person.", "Builds things.", "Reads a lot."], idx)}`,
    plan: idx % 4 === 0 ? "pro" : "free",
    createdAt: new Date(Date.UTC(2026, 0, 1 + (idx % 28), 9, idx % 60)).toISOString(),
    notes: id === 1 ? DEMO_NOTES : notes,
  };
});

/** Public view of a user — but routes leak the private fields anyway (that's the point). */
export const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, bio: u.bio, plan: u.plan });
