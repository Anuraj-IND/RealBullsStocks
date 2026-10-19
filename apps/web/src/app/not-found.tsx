import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Footer } from "@/components/ui/Footer";

export default function NotFound() {
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
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="num text-5xl font-bold text-accent">404</span>
        <h1 className="font-display text-xl font-bold">Page not found</h1>
        <p className="max-w-md text-sm text-muted">The page you are looking for doesn&apos;t exist or has been moved.</p>
        <Link href="/" className="btn-primary mt-2">
          Back to home
        </Link>
      </main>
      <Footer />
    </div>
  );
}
