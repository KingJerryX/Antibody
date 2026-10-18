import Link from "next/link";
import { DocsNav } from "@/components/docs/DocsNav";
import "@/components/docs/docs.css";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ab">
      <div className="docs-shell">
        <DocsNav />
        <div className="docs-main">
          <nav className="crumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>Docs</span>
          </nav>
          {children}
        </div>
      </div>
    </div>
  );
}
