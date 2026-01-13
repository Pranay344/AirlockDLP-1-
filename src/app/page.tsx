
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Lock, ShieldCheck, Zap, EyeOff } from 'lucide-react';
import Logo from '@/components/common/Logo';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Logo />
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign In
            </Link>
            <Button asChild>
              <Link href="/login">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="container mx-auto px-4 py-20 text-center md:px-6 lg:py-32">
          <h1 className="font-headline text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
            Secure Your Conversations with AI
          </h1>
          <p className="mx-auto mt-6 max-w-[700px] text-lg text-muted-foreground md:text-xl">
            Airlock DLP is a real-time data loss prevention tool that scans for sensitive information before it's sent to LLMs like ChatGPT, ensuring your data stays private.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/login">View Dashboard</Link>
            </Button>
          </div>
        </section>

        <section className="bg-muted py-20 lg:py-24">
          <div className="container mx-auto px-4 md:px-6">
            <div className="grid gap-12 md:grid-cols-3">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 rounded-full bg-primary p-4 text-primary-foreground">
                  <Zap className="h-8 w-8" />
                </div>
                <h3 className="font-headline text-2xl font-bold">Real-Time Scanning</h3>
                <p className="mt-2 text-muted-foreground">
                  Intercepts and scans text for sensitive patterns before it leaves your browser.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 rounded-full bg-primary p-4 text-primary-foreground">
                  <EyeOff className="h-8 w-8" />
                </div>
                <h3 className="font-headline text-2xl font-bold">On-Device Privacy</h3>
                <p className="mt-2 text-muted-foreground">
                  All scanning happens locally. Your sensitive data is never sent to a third party.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 rounded-full bg-primary p-4 text-primary-foreground">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h3 className="font-headline text-2xl font-bold">Comprehensive Policies</h3>
                <p className="mt-2 text-muted-foreground">
                  Detects PII, PHI, source code, API keys, and other confidential data.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t">
        <div className="container mx-auto flex items-center justify-between px-4 py-6 md:px-6">
          <p className="text-sm text-muted-foreground">&copy; 2024 Airlock DLP. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
