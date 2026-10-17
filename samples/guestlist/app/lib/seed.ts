// Invented guests for the Guestlist demo. Emails are @example.com. Resets every restart.

export interface Guest {
  id: number;
  name: string;
  email: string;
  phone: string;
  paid: boolean;
  plusOne: string;
}

export const GUESTS: Guest[] = [
  { id: 1, name: "Maya Chen", email: "maya@example.com", phone: "(617) 555-0142", paid: true, plusOne: "Bringing Sam. Peanut allergy." },
  { id: 2, name: "Jordan Ellis", email: "jordan@example.com", phone: "(617) 555-0190", paid: false, plusOne: "Coming alone." },
  { id: 3, name: "Priya Shah", email: "priya@example.com", phone: "(857) 555-0118", paid: true, plusOne: "Plus one is her sister." },
  { id: 4, name: "Leo Martins", email: "leo@example.com", phone: "(617) 555-0166", paid: false, plusOne: "Owes $20 for the ice." },
  { id: 5, name: "Aisha Rahman", email: "aisha@example.com", phone: "(339) 555-0134", paid: true, plusOne: "Leaving early, 11pm train." },
  { id: 6, name: "Chris Okonkwo", email: "chris@example.com", phone: "(617) 555-0177", paid: false, plusOne: "Roommate Dana is the plus one." },
];
