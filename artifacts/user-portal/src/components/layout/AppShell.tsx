import { useLocation } from "wouter";
import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import { MobileBottomNav } from "./MobileBottomNav";
import { SiteConfigProvider, useSiteConfig } from "@/lib/siteConfig";
import { useAuth } from "@/lib/auth";
import MaintenancePage from "@/pages/Maintenance";
import { VerificationGateModal } from "@/components/VerificationGateModal";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SiteConfigProvider>
      <ShellInner>{children}</ShellInner>
    </SiteConfigProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { maintenance } = useSiteConfig();
  const isAuthPage = location === "/login" || location === "/signup";

  // Maintenance gate — admins / superadmins / support can still access for ops
  const isStaff = user?.role === "admin" || user?.role === "superadmin" || user?.role === "support";
  if (maintenance.enabled && !isStaff && !isAuthPage) {
    return <MaintenancePage />;
  }

  if (isAuthPage) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <BannerStrip />
      <AppHeader />
      <main className="flex-1 flex flex-col pb-[3.75rem] xl:pb-0">{children}</main>
      <AppFooter />
      <MobileBottomNav />
      <VerificationGateModal />
    </div>
  );
}

function BannerStrip() {
  const { bannerStrip } = useSiteConfig();
  const [dismissed, setDismissed] = useState(false);
  if (!bannerStrip.enabled || !bannerStrip.message || dismissed) return null;

  const tone =
    bannerStrip.kind === "danger"  ? "bg-rose-500/15 border-rose-500/40 text-rose-100" :
    bannerStrip.kind === "warning" ? "bg-amber-500/15 border-amber-500/40 text-amber-100" :
    bannerStrip.kind === "success" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-100" :
                                     "bg-sky-500/15 border-sky-500/40 text-sky-100";

  return (
    <div className={`border-b ${tone}`}>
      <div className="container mx-auto px-4 py-2 text-xs sm:text-sm flex items-center gap-3">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate sm:whitespace-normal">{bannerStrip.message}</span>
        {bannerStrip.ctaLabel && bannerStrip.ctaUrl && (
          <a href={bannerStrip.ctaUrl} className="font-semibold underline whitespace-nowrap hover:opacity-80">
            {bannerStrip.ctaLabel} →
          </a>
        )}
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="opacity-70 hover:opacity-100 shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
