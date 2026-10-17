import { connection } from "next/server";
import Party from "./_components/Party.tsx";
import { listGuests } from "./lib/state.ts";

export default async function Home() {
  await connection();
  return <Party initialGuests={listGuests()} />;
}
