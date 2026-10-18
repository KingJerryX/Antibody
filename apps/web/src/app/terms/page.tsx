export const metadata = { title: "Terms | Antibody" };

/** Plain-language terms of use (also the Vercel Integration's EULA link). */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 text-slate-300">
      <h1 className="text-3xl font-semibold tracking-tight text-white">Terms of use</h1>
      <p className="mt-2 text-sm text-slate-500">Antibody is a HackHarvard 2026 project. Last updated October 17, 2026.</p>
      <div className="mt-8 space-y-6 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white">Only scan what you own</h2>
          <p className="mt-2">
            Use Antibody on sites and repositories you own or are allowed to test. Antibody runs live checks against a site only after you prove you control
            it, through Vercel, or a verification file or meta tag on the site.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white">You stay in charge of your code</h2>
          <p className="mt-2">
            Antibody proposes fixes as pull requests. It never merges them: you review and merge in GitHub, and you can roll back like any other change.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white">No warranty</h2>
          <p className="mt-2">
            Antibody is provided as is, without warranty of any kind. A scan can miss problems, and a clean result is not a guarantee that your site is
            secure. To the extent the law allows, the Antibody team is not liable for damages arising from its use.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white">Questions</h2>
          <p className="mt-2">
            Open an issue at{" "}
            <a href="https://github.com/antibody-hq/Antibody/issues" className="text-mint hover:underline">
              github.com/antibody-hq/Antibody
            </a>
            . See also the <a href="/privacy" className="text-mint hover:underline">privacy policy</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
