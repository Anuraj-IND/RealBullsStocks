import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Footer } from "@/components/ui/Footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <Link href="/">
          <Logo />
        </Link>
        <Link href="/login" className="btn-ghost py-1.5 text-xs">
          Sign in
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <article className="space-y-4 text-sm leading-relaxed text-ink/90 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_p]:text-muted [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted [&_a]:text-accent [&_a]:underline">
          {children}
        </article>
      </main>
      <Footer />
    </div>
  );
}
