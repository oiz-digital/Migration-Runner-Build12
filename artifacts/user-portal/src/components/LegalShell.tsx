import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRight, FileText, Printer, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export interface LegalShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  effectiveDate: string;
  version: string;
  sections: LegalSection[];
  jurisdictionNote?: string;
}

export function LegalShell({
  eyebrow,
  title,
  subtitle,
  effectiveDate,
  version,
  sections,
  jurisdictionNote,
}: LegalShellProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShowTop(window.scrollY > 600);
      const fromTop = window.scrollY + 140;
      let current = sections[0]?.id ?? "";
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.offsetTop <= fromTop) current = s.id;
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid={`page-legal-${eyebrow.toLowerCase().replace(/\s+/g, "-")}`}>
      {/* Hero */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/40 p-8 md:p-12 mb-10">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary mb-3">
          <FileText className="h-3.5 w-3.5" />
          {eyebrow}
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-3">{title}</h1>
        <p className="text-base md:text-lg text-muted-foreground max-w-3xl leading-relaxed">{subtitle}</p>
        <div className="flex flex-wrap items-center gap-2 mt-5">
          <Badge variant="secondary" className="font-medium">Effective {effectiveDate}</Badge>
          <Badge variant="outline" className="font-medium">Version {version}</Badge>
          {jurisdictionNote ? (
            <Badge variant="outline" className="font-medium">{jurisdictionNote}</Badge>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => window.print()}
            data-testid="button-print-legal"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* TOC */}
        <aside className="lg:col-span-3 lg:sticky lg:top-24 lg:self-start order-2 lg:order-1">
          <div className="rounded-xl border border-border bg-card/40 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 px-2">
              On this page
            </div>
            <nav>
              <ol className="space-y-0.5">
                {sections.map((s, i) => {
                  const active = activeId === s.id;
                  return (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                          active
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        }`}
                      >
                        <span className="text-xs tabular-nums opacity-60 w-5">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate">{s.title}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-4 mt-4 text-xs text-muted-foreground space-y-2">
            <div className="font-semibold text-foreground/90">Need help?</div>
            <p>Questions about this document? Our team is happy to clarify.</p>
            <Link href="/support" className="inline-flex items-center text-primary hover:underline">
              Contact support <ChevronRight className="h-3 w-3 ml-0.5" />
            </Link>
          </div>
        </aside>

        {/* Content */}
        <article className="lg:col-span-9 order-1 lg:order-2 space-y-10 leading-relaxed">
          {sections.map((s, i) => (
            <section id={s.id} key={s.id} className="scroll-mt-24">
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-xs font-bold tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight">{s.title}</h2>
              </div>
              <div className="prose prose-sm md:prose-base max-w-none text-foreground/90 [&_p]:my-3 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1 [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold">
                {s.content}
              </div>
            </section>
          ))}

          <div className="rounded-xl border border-dashed border-border bg-card/30 p-5 text-xs text-muted-foreground">
            This document is published in good faith for transparency.
            We may update it from time to time; material changes will be
            announced in-app and via email at least 14 days before they take effect.
            The latest version is always available on this page.
          </div>
        </article>
      </div>

      {showTop ? (
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-6 right-6 shadow-lg z-40"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          data-testid="button-back-to-top"
        >
          <ArrowUp className="h-3.5 w-3.5 mr-1" /> Top
        </Button>
      ) : null}
    </div>
  );
}

export default LegalShell;
