"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Building2,
  Shield,
  LogOut,
  Settings,
  ChevronRight,
  ChevronLeft,
  Menu,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/agencies", label: "Agencies", icon: Building2 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("tripsync_admin_sidebar_collapsed");
    if (saved === "true") {
      setIsCollapsed(true);
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("tripsync_admin_sidebar_collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && (session?.user as Record<string, unknown>)?.role !== "SuperAdmin") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#0a0a0b]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!session || (session.user as Record<string, unknown>)?.role !== "SuperAdmin") return null;

  const user = session.user;

  function renderSidebar(collapsed: boolean = false) {
    return (
      <>
        {/* Logo */}
        <div className={`h-16 flex items-center border-b border-gray-200/80 dark:border-[#1e1e21] transition-all ${
          collapsed ? "px-2 justify-between" : "px-3.5 justify-between"
        }`}>
          <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm flex-shrink-0">
              <Shield className="h-4 w-4 text-primary-foreground" strokeWidth={2} />
            </div>
            {!collapsed && (
              <div className="truncate">
                <h1 className="text-[14px] font-semibold tracking-tight text-gray-900 dark:text-gray-50 truncate leading-none">TripSync</h1>
                <p className="text-[9.5px] text-muted-foreground font-semibold uppercase tracking-wider truncate mt-0.5">Super Admin</p>
              </div>
            )}
          </div>
          
          <button
            onClick={toggleCollapse}
            className="hidden lg:flex items-center justify-center h-7 w-7 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1a1a1d] transition-colors flex-shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 py-4 space-y-0.5 ${collapsed ? "px-2" : "px-3"}`}>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Platform</p>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            const activeClass = isActive
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1d] hover:text-gray-900 dark:hover:text-gray-200";

            if (collapsed) {
              return (
                <div key={item.href} className="flex justify-center my-0.5">
                  <Link
                    href={item.href}
                    title={item.label}
                    className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${activeClass}`}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.7} />
                  </Link>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${activeClass}`}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.7} />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* Theme Toggle */}
        <div className={`py-3 border-t border-gray-200/80 dark:border-[#1e1e21] flex items-center ${
          collapsed ? "px-1 justify-center" : "px-4 justify-between"
        }`}>
          {!collapsed && (
            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Theme</span>
          )}
          <ThemeToggle />
        </div>

        {/* User */}
        <div className={`py-3 border-t border-gray-200/80 dark:border-[#1e1e21] ${
          collapsed ? "px-1.5" : "px-3"
        }`}>
          <DropdownMenu>
            <DropdownMenuTrigger className={`w-full flex items-center rounded-xl hover:bg-gray-50 dark:hover:bg-[#1a1a1d] transition-colors cursor-pointer ${
              collapsed ? "justify-center py-2 px-0" : "gap-2.5 px-3 py-2.5"
            }`}>
              <Avatar className="h-8 w-8 ring-2 ring-primary/10 dark:ring-primary/20 flex-shrink-0">
                <AvatarFallback className="text-xs bg-gradient-to-br from-primary/10 to-primary/5 text-primary font-semibold dark:from-primary/20 dark:to-primary/10">
                  SA
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-none truncate text-gray-900 dark:text-gray-100">{user.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 font-medium truncate">Super Admin</p>
                  </div>
                  <Settings className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} className="w-[220px]">
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })} className="gap-2.5 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#f8f9fb] dark:bg-[#0a0a0b]">
      {/* Mobile Header */}
      <header className="sticky top-0 z-20 flex lg:hidden items-center justify-between px-4 h-16 border-b border-gray-200/80 dark:border-[#1e1e21] bg-white dark:bg-[#111113] w-full">
        <div className="flex items-center gap-2.5">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="-ml-2 h-9 w-9 text-gray-500 dark:text-gray-400" />}>
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[200px] p-0 border-none bg-transparent">
              <aside className="w-[200px] h-full bg-white dark:bg-[#111113] border-r border-gray-200/80 dark:border-[#1e1e21] flex flex-col">
                {renderSidebar(false)}
              </aside>
            </SheetContent>
          </Sheet>
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm">
            <Shield className="h-4 w-4 text-primary-foreground" strokeWidth={2} />
          </div>
          <span className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">TripSync</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Desktop Sidebar */}
      <aside className={`bg-white dark:bg-[#111113] border-r border-gray-200/80 dark:border-[#1e1e21] hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 transition-[width] duration-300 ease-in-out ${
        isCollapsed ? "w-16" : "w-[200px]"
      }`}>
        {renderSidebar(isCollapsed)}
      </aside>

      {/* Main content */}
      <main className={`flex-1 min-h-screen transition-[margin-left] duration-300 ease-in-out ${
        isCollapsed ? "lg:ml-16" : "lg:ml-[200px]"
      }`}>
        <div className="max-w-[1400px] mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
