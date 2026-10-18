export const metadata = { title: "Privacy | Antibody" };

/** Plain-language privacy policy. Kept in step with what the code actually stores. */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 text-slate-300">
      <h1 className="text-3xl font-semibold tracking-tight text-white">Privacy</h1>
      <p className="mt-2 text-sm text-slate-500">Antibody is a HackHarvard 2026 project. Last updated October 17, 2026.</p>
      <div className="mt-8 space-y-6 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white">What we store</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your GitHub user id, username and avatar, in a signed cookie, so you stay signed in.</li>
            <li>For each site you set up: its address, the GitHub repo you connect, the GitHub App installation id, and whether you proved you own it.</li>
            <li>Scan results, proposed fixes and their activity log for those sites.</li>
            <li>Phone numbers you register for alerts, and the texts and calls about your sites.</li>
          </ul>
          <p className="mt-2">Scans you run while signed out are not stored at all.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white">What we don&apos;t store</h2>
          <p className="mt-2">
            We don&apos;t keep your GitHub or Vercel access tokens. The Vercel token is used once to list your projects and domains. Your code is cloned
            only for the length of a code check or a fix, then deleted.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white">Who else sees it</h2>
          <p className="mt-2">
            Data lives in Supabase. Code for a fix is read by Factory&apos;s Droid on a Chalk server. Texts go through Photon and calls through ElevenLabs.
            We don&apos;t sell or share your data with anyone else.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white">Removing your data</h2>
          <p className="mt-2">
            Uninstall the Antibody GitHub App or Vercel Integration at any time to cut off access. To have your stored data deleted, open an issue at{" "}
            <a href="https://github.com/antibody-hq/Antibody/issues" className="text-mint hover:underline">
              github.com/antibody-hq/Antibody
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
