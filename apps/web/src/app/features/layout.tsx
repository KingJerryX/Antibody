import Link from "next/link";
import { FeaturesNav } from "@/components/features/FeaturesNav";
import "./features.css";

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ab">
      <div className="feat-shell">
        <FeaturesNav />
        <div className="feat-main">
          <nav className="crumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>Features</span>
          </nav>
          {children}
        </div>
      </div>
    </div>
  );
}
