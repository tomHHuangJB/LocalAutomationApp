import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import Forms from "./pages/Forms";
import Components from "./pages/Components";
import Tables from "./pages/Tables";
import Dynamic from "./pages/Dynamic";
import Errors from "./pages/Errors";
import Performance from "./pages/Performance";
import A11y from "./pages/A11y";
import I18n from "./pages/I18n";
import Files from "./pages/Files";
import Experiments from "./pages/Experiments";
import Integrations from "./pages/Integrations";
import System from "./pages/System";
import DebugPanel from "./components/DebugPanel";

const navItems = [
  { path: "/", label: "Dashboard" },
  { path: "/auth", label: "Auth" },
  { path: "/forms", label: "Forms" },
  { path: "/components", label: "Components" },
  { path: "/tables", label: "Tables" },
  { path: "/dynamic", label: "Dynamic" },
  { path: "/errors", label: "Errors" },
  { path: "/performance", label: "Performance" },
  { path: "/a11y", label: "A11y" },
  { path: "/i18n", label: "I18n" },
  { path: "/files", label: "Files" },
  { path: "/experiments", label: "Experiments" },
  { path: "/integrations", label: "Integrations" },
  { path: "/system", label: "System" }
];

export default function App() {
  const [isMegaMenuOpen, setIsMegaMenuOpen] = React.useState(false);

  const handleMegaMenuBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsMegaMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen text-ink">
      <a href="#main" className="sr-only focus:not-sr-only" data-testid="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 backdrop-blur bg-white/70 border-b border-black/10">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Local Automation Lab</div>
            <div className="flex items-center gap-3 lg:hidden">
              <button
                type="button"
                className="rounded border border-black/20 px-3 py-1 text-sm"
                aria-haspopup="true"
                aria-expanded={isMegaMenuOpen}
                onClick={() => setIsMegaMenuOpen((open) => !open)}
                data-testid="mobile-menu-button"
              >
                Menu
              </button>
            </div>
            <nav className="hidden lg:flex items-center gap-4 text-sm">
              <div
                className="relative group"
                data-testid="mega-menu"
                onMouseEnter={() => setIsMegaMenuOpen(true)}
                onMouseLeave={() => setIsMegaMenuOpen(false)}
                onFocus={() => setIsMegaMenuOpen(true)}
                onBlur={handleMegaMenuBlur}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsMegaMenuOpen(false);
                  }
                }}
              >
                <button
                  className="px-2 py-1 rounded hover:bg-ember/10"
                  aria-haspopup="true"
                  aria-expanded={isMegaMenuOpen}
                >
                  Mega Menu
                </button>
                <div
                  className={`absolute left-0 top-full w-80 pt-2 ${isMegaMenuOpen ? "block" : "hidden"}`}
                >
                  <div className="rounded-xl border border-black/10 bg-white p-4 shadow-lg">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {navItems.slice(0, 6).map((item) => (
                        <NavLink key={`mega-${item.path}`} to={item.path} className="rounded px-2 py-1 hover:bg-ember/10">
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `px-2 py-1 rounded ${isActive ? "bg-ember text-white" : "hover:bg-ember/10"}`
                  }
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  data-qa={`nav-${item.label.toLowerCase()}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="text-xs text-black/60">ALT+SHIFT+D</div>
          </div>
          <div className={`lg:hidden ${isMegaMenuOpen ? "block" : "hidden"}`}>
            <div className="mt-3 rounded-xl border border-black/10 bg-white p-3 shadow-sm">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {navItems.map((item) => (
                  <NavLink
                    key={`mobile-${item.path}`}
                    to={item.path}
                    className="rounded px-2 py-1 hover:bg-ember/10"
                    data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/forms" element={<Forms />} />
          <Route path="/components" element={<Components />} />
          <Route path="/tables" element={<Tables />} />
          <Route path="/dynamic" element={<Dynamic />} />
          <Route path="/errors" element={<Errors />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/a11y" element={<A11y />} />
          <Route path="/i18n" element={<I18n />} />
          <Route path="/files" element={<Files />} />
          <Route path="/experiments" element={<Experiments />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/system" element={<System />} />
        </Routes>
      </main>
      <DebugPanel />
    </div>
  );
}
