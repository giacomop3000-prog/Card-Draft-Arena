import React from "react";
import { Link, useLocation } from "wouter";
import { Layers, PlaySquare, Home as HomeIcon } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: HomeIcon },
    { href: "/cards", label: "Card Library", icon: Layers },
    { href: "/drafts", label: "Drafts", icon: PlaySquare },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border bg-card/50 flex-shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-2 font-bold text-lg tracking-wider text-primary uppercase">
            <Layers className="h-6 w-6" />
            <span>Draft Command</span>
          </div>
        </div>
        <nav className="px-4 pb-6 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isActive ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`} data-testid={`nav-link-${item.label.toLowerCase().replace(' ', '-')}`}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
