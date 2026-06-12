import { Link } from "wouter";
import {
  Twitter,
  Send,
  Github,
  Youtube,
  Instagram,
  Facebook,
  Linkedin,
  MessageCircle,
  Mail,
  Shield,
  Lock,
  Award,
  Globe2,
  ArrowRight,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSiteConfig, type FooterSocial, type FooterBadge } from "@/lib/siteConfig";

const SOCIAL_ICONS: Record<string, LucideIcon> = {
  twitter:   Twitter,
  telegram:  Send,
  instagram: Instagram,
  youtube:   Youtube,
  github:    Github,
  facebook:  Facebook,
  linkedin:  Linkedin,
  discord:   MessageCircle,
};

const BADGE_ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  lock:   Lock,
  award:  Award,
};

export function AppFooter() {
  const { brand, footer } = useSiteConfig();

  return (
    <footer className="mt-auto bg-card border-t border-border/60">

      {/* ── Newsletter strip ──────────────────────────────────── */}
      <div className="bg-primary/5 border-b border-border/50">
        <div className="container mx-auto px-6 py-10 flex flex-col lg:flex-row items-start lg:items-center gap-6 justify-between">
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-semibold tracking-tight">Stay ahead of the market</h3>
            <p className="text-sm text-muted-foreground">
              Weekly market briefings, new listings, and product updates — straight to your inbox.
            </p>
          </div>
          <form
            className="flex w-full lg:w-auto gap-2 min-w-[360px]"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="email"
                placeholder="you@example.com"
                className="pl-9 h-10 bg-background border-border/70 focus:border-primary/50"
                aria-label="Email address"
              />
            </div>
            <Button type="submit" size="sm" className="h-10 px-5 gap-1.5 shrink-0">
              Subscribe <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </div>

      {/* ── Main columns ─────────────────────────────────────── */}
      <div className="container mx-auto px-6 py-14 grid gap-12 lg:grid-cols-12">

        {/* Brand block */}
        <div className="lg:col-span-4 space-y-5">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-black font-extrabold text-lg flex items-center justify-center shadow-md group-hover:shadow-orange-500/30 transition-shadow">
              {brand.name.charAt(0).toUpperCase()}
            </span>
            <span className="text-xl font-extrabold tracking-tight">
              {brand.name}<span className="text-primary">.</span>
            </span>
          </Link>

          {/* Tagline */}
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
            {brand.tagline}
          </p>

          {/* Trust badges */}
          {footer.badges.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              {footer.badges.map((b) => <TrustBadge key={b.label} badge={b} />)}
            </div>
          )}

          {/* Socials */}
          {footer.socials.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {footer.socials.map((s) => <SocialLink key={s.label} social={s} />)}
            </div>
          )}
        </div>

        {/* Link columns */}
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {footer.columns.map((col) => (
            <div key={col.title} className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-foreground/70">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={`${col.title}:${l.label}`}>
                    {l.external || /^https?:\/\//.test(l.href) ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 inline-flex items-center gap-1 group"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── Risk disclaimer ─────────────────────────────────── */}
      {footer.riskWarning && (
        <div className="border-t border-border/40">
          <div className="container mx-auto px-6 py-5 text-[11px] leading-relaxed text-muted-foreground/70">
            <strong className="text-muted-foreground font-semibold">Risk warning: </strong>
            {footer.riskWarning}
          </div>
        </div>
      )}

      {/* ── Bottom strip ────────────────────────────────────── */}
      <div className="border-t border-border/40 bg-background/40">
        <div className="container mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/60">
          <div>
            {brand.copyright
              .replace(/^©\s*/, "© ")
              .replace(/\{year\}/g, String(new Date().getFullYear()))}
          </div>
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              All systems operational
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe2 className="h-3 w-3" />
              English (IN)
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({ social }: { social: FooterSocial }) {
  const Icon = SOCIAL_ICONS[social.kind] ?? Globe2;
  return (
    <a
      href={social.href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={social.label}
      title={social.label}
      className="h-8 w-8 rounded-lg border border-border/60 bg-background/50 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 flex items-center justify-center transition-all duration-150"
    >
      <Icon className="h-3.5 w-3.5" />
    </a>
  );
}

function TrustBadge({ badge }: { badge: FooterBadge }) {
  const Icon = BADGE_ICONS[badge.kind] ?? Shield;
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground/80">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
        <Icon className="h-3 w-3" />
      </span>
      <span>{badge.label}</span>
      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
    </span>
  );
}
