import Link from "next/link";
import type { ReactNode } from "react";

export function PublicLegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main dir="rtl" className="mx-auto min-h-screen max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-3 text-sm font-black tracking-wide text-amber-600">GO FITNESS</p>
        <h1 className="text-3xl font-black">{title}</h1>
        <nav aria-label="صفحات المساعدة" className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
          <Link href="/privacy" className="underline underline-offset-4">سياسة الخصوصية</Link>
          <Link href="/support" className="underline underline-offset-4">الدعم والمساعدة</Link>
          <Link href="/login" className="underline underline-offset-4">تسجيل الدخول</Link>
        </nav>
      </header>
      <article className="space-y-7 text-sm leading-8 sm:text-base">{children}</article>
      <footer className="mt-10 border-t border-border pt-5 text-sm text-muted-foreground">GO Fitness · خدمات النادي والعضوية</footer>
    </main>
  );
}
