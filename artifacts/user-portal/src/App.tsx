import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/lib/theme";

import Home from "@/pages/Home";
import Markets from "@/pages/Markets";
import Trade from "@/pages/Trade";
import Futures from "@/pages/Futures";
import Options from "@/pages/Options";
import Web3 from "@/pages/Web3";
import Discover from "@/pages/Discover";
import Wallet from "@/pages/Wallet";
import Orders from "@/pages/Orders";
import Invoice from "@/pages/Invoice";
import Portfolio from "@/pages/Portfolio";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import Profile from "@/pages/Profile";
import Kyc from "@/pages/Kyc";
import Banks from "@/pages/Banks";
import Settings from "@/pages/Settings";
import Earn from "@/pages/Earn";
import Invite from "@/pages/Invite";
import Support from "@/pages/Support";
import About from "@/pages/About";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Aml from "@/pages/Aml";
import Cookies from "@/pages/Cookies";
import Risk from "@/pages/Risk";
import Fees from "@/pages/Fees";
import ApiDocs from "@/pages/ApiDocs";
import Careers from "@/pages/Careers";
import Blog from "@/pages/Blog";
import Press from "@/pages/Press";
import Contact from "@/pages/Contact";
import Help from "@/pages/Help";
import Status from "@/pages/Status";
import P2P from "@/pages/P2P";
import Convert from "@/pages/Convert";
import Notifications from "@/pages/Notifications";
import Bots from "@/pages/Bots";
import AITrading from "@/pages/AITrading";
import AIInvoice from "@/pages/AIInvoice";
import SpotStatement from "@/pages/SpotStatement";
import AIStatement from "@/pages/AIStatement";
import Ledger from "@/pages/Ledger";
import Referrals from "@/pages/Referrals";
import CopyTrading from "@/pages/CopyTrading";
import PortfolioPro from "@/pages/PortfolioPro";
import ProDashboard from "@/pages/ProDashboard";
import Calculator from "@/pages/tools/Calculator";
import Converter from "@/pages/tools/Converter";
import Compare from "@/pages/tools/Compare";
import Predictions from "@/pages/tools/Predictions";
import Announcements from "@/pages/Announcements";
import News from "@/pages/News";
import Leagues from "@/pages/Leagues";
import Forex from "@/pages/Forex";
import SmartAPI from "@/pages/SmartAPI";
import Stocks from "@/pages/Stocks";
import Commodities from "@/pages/Commodities";
import BrokerOnboarding from "@/pages/BrokerOnboarding";
import BrokerDashboard from "@/pages/BrokerDashboard";
import SupportChatWidget from "@/components/SupportChatWidget";
import PriceAlerts from "@/pages/PriceAlerts";
import INRPayments from "@/pages/INRPayments";
import SupportTickets from "@/pages/SupportTickets";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function App() {
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary onReset={reset}>
            <AuthProvider>
              <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppShell>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/markets" component={Markets} />
                <Route path="/trade/:symbol?">
                  {() => <RequireAuth><Trade /></RequireAuth>}
                </Route>
                <Route path="/futures/:symbol?">
                  {() => <RequireAuth><Futures /></RequireAuth>}
                </Route>
                <Route path="/options">
                  {() => <RequireAuth><Options /></RequireAuth>}
                </Route>
                <Route path="/web3">{() => <RequireAuth><Web3 /></RequireAuth>}</Route>
                <Route path="/discover" component={Discover} />
                
                <Route path="/wallet">
                  {() => <RequireAuth><Wallet /></RequireAuth>}
                </Route>
                <Route path="/orders/:id/invoice">
                  {() => <RequireAuth><Invoice /></RequireAuth>}
                </Route>
                <Route path="/orders/statement">
                  {() => <RequireAuth><SpotStatement /></RequireAuth>}
                </Route>
                <Route path="/orders">
                  {() => <RequireAuth><Orders /></RequireAuth>}
                </Route>
                <Route path="/portfolio">
                  {() => <RequireAuth><Portfolio /></RequireAuth>}
                </Route>
                <Route path="/profile">
                  {() => <RequireAuth><Profile /></RequireAuth>}
                </Route>
                <Route path="/kyc">
                  {() => <RequireAuth><Kyc /></RequireAuth>}
                </Route>
                <Route path="/banks">
                  {() => <RequireAuth><Banks /></RequireAuth>}
                </Route>
                <Route path="/settings">
                  {() => <RequireAuth><Settings /></RequireAuth>}
                </Route>
                <Route path="/earn">
                  {() => <RequireAuth><Earn /></RequireAuth>}
                </Route>
                <Route path="/invite">
                  {() => <RequireAuth><Invite /></RequireAuth>}
                </Route>
                <Route path="/support" component={Support} />

                <Route path="/about" component={About} />
                {/* Canonical short routes (used by footer + all links) */}
                <Route path="/terms" component={Terms} />
                <Route path="/privacy" component={Privacy} />
                <Route path="/aml" component={Aml} />
                <Route path="/cookies" component={Cookies} />
                <Route path="/risk" component={Risk} />
                <Route path="/api-docs" component={ApiDocs} />
                {/* Legacy /legal/* redirects — kept for SEO / bookmarks */}
                <Route path="/legal/terms" component={Terms} />
                <Route path="/legal/privacy" component={Privacy} />
                <Route path="/legal/aml" component={Aml} />
                <Route path="/legal/cookies" component={Cookies} />
                <Route path="/legal/risk" component={Risk} />
                <Route path="/fees" component={Fees} />
                <Route path="/docs/api" component={ApiDocs} />
                <Route path="/careers" component={Careers} />
                <Route path="/blog" component={Blog} />
                <Route path="/press" component={Press} />
                <Route path="/contact" component={Contact} />
                <Route path="/help" component={Help} />
                <Route path="/status" component={Status} />
                <Route path="/p2p">
                  {() => <RequireAuth><P2P /></RequireAuth>}
                </Route>
                <Route path="/convert">
                  {() => <RequireAuth><Convert /></RequireAuth>}
                </Route>

                <Route path="/dashboard">
                  {() => <RequireAuth><ProDashboard /></RequireAuth>}
                </Route>
                <Route path="/notifications">
                  {() => <RequireAuth><Notifications /></RequireAuth>}
                </Route>
                <Route path="/bots">
                  {() => <RequireAuth><Bots /></RequireAuth>}
                </Route>
                <Route path="/ai-trading/:id/invoice">
                  {() => <RequireAuth><AIInvoice /></RequireAuth>}
                </Route>
                <Route path="/ai-trading/statement">
                  {() => <RequireAuth><AIStatement /></RequireAuth>}
                </Route>
                <Route path="/ai-trading">
                  {() => <RequireAuth><AITrading /></RequireAuth>}
                </Route>
                <Route path="/ledger">
                  {() => <RequireAuth><Ledger /></RequireAuth>}
                </Route>
                <Route path="/referrals">
                  {() => <RequireAuth><Referrals /></RequireAuth>}
                </Route>
                <Route path="/copy-trading">
                  {() => <RequireAuth><CopyTrading /></RequireAuth>}
                </Route>
                <Route path="/price-alerts">
                  {() => <RequireAuth><PriceAlerts /></RequireAuth>}
                </Route>
                <Route path="/inr">
                  {() => <RequireAuth><INRPayments /></RequireAuth>}
                </Route>
                <Route path="/support-tickets">
                  {() => <RequireAuth><SupportTickets /></RequireAuth>}
                </Route>
                <Route path="/portfolio-pro">
                  {() => <RequireAuth><PortfolioPro /></RequireAuth>}
                </Route>

                <Route path="/tools/calculator" component={Calculator} />
                <Route path="/tools/converter" component={Converter} />
                <Route path="/tools/compare" component={Compare} />
                <Route path="/tools/predictions" component={Predictions} />
                <Route path="/announcements" component={Announcements} />
                <Route path="/news" component={News} />
                <Route path="/leagues">
                  {() => <RequireAuth><Leagues /></RequireAuth>}
                </Route>
                <Route path="/forex" component={Forex} />
                <Route path="/smartapi">
                  {() => <RequireAuth><SmartAPI /></RequireAuth>}
                </Route>
                <Route path="/stocks" component={Stocks} />
                <Route path="/commodities" component={Commodities} />
                <Route path="/broker/onboarding">
                  {() => <RequireAuth><BrokerOnboarding /></RequireAuth>}
                </Route>
                <Route path="/broker/dashboard">
                  {() => <RequireAuth><BrokerDashboard /></RequireAuth>}
                </Route>

                <Route path="/login" component={Login} />
                <Route path="/signup" component={Signup} />
                <Route path="/forgot-password" component={ForgotPassword} />
                
                <Route component={NotFound} />
              </Switch>
            </AppShell>
            <SupportChatWidget />
            <Toaster />
          </WouterRouter>
              </TooltipProvider>
            </AuthProvider>
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
