import Link from "next/link";

const LINKS: Array<[string, string]> = [
  ["Privacy", "/legal/privacy"],
  ["Terms", "/legal/terms"],
  ["Cookies", "/legal/cookies"],
  ["Risk disclaimer", "/legal/risk"],
  ["Help", "/help"],
];

export function Footer() {
  return (
    <footer className="border-t border-line px-4 py-5 text-xs text-muted">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <span>© {new Date().getFullYear()} Realbulls. All rights reserved.</span>
        <nav className="flex flex-wrap gap-4">
          {LINKS.map(([label, href]) => (
            <Link key={href} href={href} className="transition-colors hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
