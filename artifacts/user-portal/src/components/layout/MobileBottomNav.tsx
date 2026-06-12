import { Link, useLocation } from "wouter";
import {
  Home,
  TrendingUp,
  ArrowLeftRight,
  Wallet as WalletIcon,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/",        label: "Home",    icon: Home,           exact: true },
  { href: "/markets", label: "Markets", icon: TrendingUp,     exact: false },
  { href: "/trade",   label: "Trade",   icon: ArrowLeftRight, exact: false },
  { href: "/wallet",  label: "Wallet",  icon: WalletIcon,     exact: false },
  { href: "/profile", label: "Account", icon: UserIcon,       exact: false },
];

export function MobileBottomNav() {
  const [loc] = useLocation();
  const { user } = useAuth();

  const accountHref = user ? "/profile" : "/login";

  return (
    <nav
      className="xl:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/80
                 bg-card/90 backdrop-blur-xl supports-[backdrop-filter]:bg-card/75
                 safe-area-bottom"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-[3.75rem] px-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const resolvedHref = label === "Account" ? accountHref : href;
          const active = exact ? loc === href : loc.startsWith(href) && href !== "/";
          const isHome = exact && loc === "/";
          const isActive = active || isHome;

          return (
            <Link key={href} href={resolvedHref}>
              <button
                type="button"
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 min-w-[3rem] h-12 px-2 rounded-xl transition-all duration-200",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground active:scale-95",
                )}
                aria-label={label}
              >
                {isActive && (
                  <span className="absolute inset-0 rounded-xl bg-primary/10" />
                )}
                <Icon
                  className={cn(
                    "relative h-5 w-5 transition-transform duration-200",
                    isActive && "scale-110",
                  )}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                <span className="relative text-[10px] font-medium leading-none tracking-tight">
                  {label}
                </span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
