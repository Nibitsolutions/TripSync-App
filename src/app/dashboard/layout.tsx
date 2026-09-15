"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
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
  FileText,
  Users,
  Wallet,
  Receipt,
  TrendingUp,
  CheckCircle,
  Landmark,
  BarChart3,
  LogOut,
  Settings,
  ChevronRight,
  ChevronLeft,
  Menu,
  UserCheck,
  Building2,
  BookOpen,
  User,
  CreditCard,
  HelpCircle,
  FileSpreadsheet,
} from "lucide-react";

interface NavChild {
  href: string;
  label: string;
  type?: string | null;
  tab?: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children?: NavChild[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      {
        href: "/dashboard/invoices",
        label: "Invoices",
        icon: FileText,
        children: [
          { href: "/dashboard/invoices?type=Ticket", label: "Tickets", type: "Ticket" },
          { href: "/dashboard/invoices?type=Hotel", label: "Hotels", type: "Hotel" },
          { href: "/dashboard/invoices?type=Umrah", label: "Umrah", type: "Umrah" },
          { href: "/dashboard/invoices?type=Hajj", label: "Hajj", type: "Hajj" },
          { href: "/dashboard/invoices?type=Visa", label: "Visas", type: "Visa" },
          { href: "/dashboard/invoices?type=Other", label: "Others", type: "Other" },
        ],
      },
    ],
  },
  {
    title: "CONTACTS",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: Users },
      { href: "/dashboard/suppliers", label: "Suppliers", icon: Building2 },
    ],
  },
  {
    title: "FINANCE",
    items: [
      {
        href: "/dashboard/vouchers",
        label: "Vouchers",
        icon: BookOpen,
        children: [
          { href: "/dashboard/vouchers?type=RV", label: "RV — Receipt", type: "RV" },
          { href: "/dashboard/vouchers?type=PV", label: "PV — Payment", type: "PV" },
          { href: "/dashboard/vouchers?type=JV", label: "JV — Journal", type: "JV" },
          { href: "/dashboard/vouchers?type=DN", label: "DN — Debit Note", type: "DN" },
          { href: "/dashboard/vouchers?type=CD", label: "CD — Cash Deposit", type: "CD" },
        ],
      },
      { href: "/dashboard/commissions", label: "Commissions", icon: TrendingUp },
      { href: "/dashboard/tax-codes", label: "Tax Codes", icon: Landmark },
      { href: "/dashboard/approvals", label: "Approvals", icon: CheckCircle },
    ],
  },
  {
    title: "REPORTS",
    items: [
      { href: "/dashboard/reports?tab=customer-ledger", label: "Customer Ledger", icon: FileText },
      { href: "/dashboard/reports?tab=supplier-ledger", label: "Supplier Ledger", icon: Building2 },
      { href: "/dashboard/reports?tab=analytics", label: "Business Analytics", icon: BarChart3 },
      { href: "/dashboard/reports?tab=wht", label: "WHT Tax Report", icon: Landmark },
      { href: "/dashboard/reports?tab=financial", label: "Financial Documents", icon: FileSpreadsheet },
    ],
  },
  {
    title: "ADMIN",
    items: [
      { href: "/dashboard/agents", label: "Team & Agents", icon: UserCheck },
      { href: "/dashboard/settings?tab=profile", label: "Profile", icon: User },
      { href: "/dashboard/settings?tab=agency", label: "Agency Details", icon: Building2 },
      { href: "/dashboard/settings?tab=billing", label: "Billing", icon: CreditCard },
      { href: "/dashboard/settings?tab=support", label: "Support", icon: HelpCircle },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("tripsync_sidebar_collapsed");
    if (saved === "false") {
      setIsCollapsed(false);
    } else {
      setIsCollapsed(true);
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("tripsync_sidebar_collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    setOpen(false);
    setIsHovered(false);
  }, [pathname]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#0a0a0b]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">TS</span>
          </div>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  if (pathname.includes("/print")) {
    return <>{children}</>;
  }

  const user = session.user;
  const initials = user.name?.split(" ").map((n) => n[0]).join("") || "U";

  const isExpandedView = !isCollapsed || isHovered;

  function renderSidebar(collapsed: boolean = false) {
    const isFullView = !collapsed;
    return (
      <>
        {/* Logo */}
        <div className={`h-16 flex items-center border-b border-gray-200/80 dark:border-[#1e1e21] transition-all ${
          isFullView ? "px-3.5 justify-between" : "px-0 justify-center"
        }`}>
          {isFullView ? (
            <>
              <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-primary-foreground font-bold text-xs tracking-tight">TS</span>
                </div>
                <div className="truncate">
                  <h1 className="text-[14px] font-semibold tracking-tight text-gray-900 dark:text-gray-50 truncate leading-none">TripSync</h1>
                  <p className="text-[9.5px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider truncate mt-0.5">Finance &amp; ERP</p>
                </div>
              </div>
              <button
                onClick={toggleCollapse}
                className="hidden lg:flex items-center justify-center h-7 w-7 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1a1a1d] transition-colors flex-shrink-0"
                title={isCollapsed ? "Pin expanded sidebar" : "Collapse sidebar"}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div
              className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm flex-shrink-0 cursor-pointer"
              title="Hover to expand sidebar"
              onClick={toggleCollapse}
            >
              <span className="text-primary-foreground font-bold text-xs tracking-tight">TS</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className={`flex-1 py-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${
          isFullView ? "px-3" : "px-2"
        }`}>
          <Suspense fallback={<div className="text-xs text-gray-400 px-3">Loading menu...</div>}>
            <SidebarNav pathname={pathname} collapsed={!isFullView} />
          </Suspense>
        </nav>

        {/* Theme Toggle */}
        <div className={`py-3 border-t border-gray-200/80 dark:border-[#1e1e21] flex items-center ${
          isFullView ? "px-4 justify-between" : "px-1 justify-center"
        }`}>
          {isFullView && (
            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Theme</span>
          )}
          <ThemeToggle />
        </div>

        {/* User */}
        <div className={`py-3 border-t border-gray-200/80 dark:border-[#1e1e21] ${
          isFullView ? "px-3" : "px-1.5"
        }`}>
          <DropdownMenu>
            <DropdownMenuTrigger className={`w-full flex items-center rounded-xl hover:bg-gray-50 dark:hover:bg-[#1a1a1d] transition-colors cursor-pointer ${
              isFullView ? "gap-2.5 px-3 py-2.5" : "justify-center py-2 px-0"
            }`} title={user.name || undefined}>
              <Avatar className="h-8 w-8 ring-2 ring-gray-100 dark:ring-[#1e1e21] flex-shrink-0">
                <AvatarFallback className="text-xs bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {isFullView && (
                <>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-none truncate text-gray-900 dark:text-gray-100">{user.name}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium truncate">{(user as Record<string, unknown>).role as string}</p>
                  </div>
                  <Settings className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side={isFullView ? "bottom" : "right"} className="w-[220px]">
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })} className="gap-2.5 text-red-500 focus:text-red-500">
                <LogOut className="h-4 w-4" />
                Sign Out
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
            <span className="text-primary-foreground font-bold text-sm tracking-tight">TS</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">TripSync</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Desktop Sidebar */}
      <aside
        onMouseEnter={() => {
          if (isCollapsed) setIsHovered(true);
        }}
        onMouseLeave={() => setIsHovered(false)}
        className={`bg-white dark:bg-[#111113] border-r border-gray-200/80 dark:border-[#1e1e21] hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 transition-[width,box-shadow] duration-300 ease-in-out ${
          isExpandedView ? "w-[200px]" : "w-16"
        } ${isCollapsed && isHovered ? "shadow-2xl z-40 border-r-gray-300 dark:border-r-gray-800" : ""}`}
      >
        {renderSidebar(!isExpandedView)}
      </aside>

      {/* Main content */}
      <main className={`flex-1 min-h-screen transition-[margin-left] duration-300 ease-in-out ${
        isCollapsed ? "lg:ml-16" : "lg:ml-[200px]"
      }`}>
        <div className="w-full px-3 md:px-6 py-5">
          {children}
        </div>
      </main>
    </div>
  );
}

function SidebarNav({ pathname, collapsed }: { pathname: string; collapsed?: boolean }) {
  const searchParams = useSearchParams();
  return (
    <div className="space-y-4">
      {navSections.map((section, idx) => (
        <div key={section.title}>
          {collapsed ? (
            idx > 0 && <div className="my-2 border-t border-gray-200/60 dark:border-gray-800/60 mx-1" />
          ) : (
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {section.title}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => renderNavItem(item, pathname, searchParams, collapsed))}
          </div>
        </div>
      ))}
    </div>
  );
}

function checkIsItemActive(itemHref: string, pathname: string, searchParams: { get: (k: string) => string | null }) {
  const [basePath, query] = itemHref.split("?");
  if (query) {
    const params = new URLSearchParams(query);
    const tabParam = params.get("tab");
    const typeParam = params.get("type");
    if (tabParam) return pathname === basePath && searchParams.get("tab") === tabParam;
    if (typeParam) return pathname === basePath && searchParams.get("type") === typeParam;
    return pathname === basePath;
  }
  if (itemHref === "/dashboard") return pathname === "/dashboard";
  return pathname === basePath || pathname.startsWith(basePath + "/");
}

function checkIsChildActive(child: NavChild, searchParams: { get: (k: string) => string | null }) {
  const activeType = searchParams.get("type");
  const activeTab = searchParams.get("tab");
  if (child.type !== undefined) {
    return child.type ? activeType === child.type : !activeType;
  }
  if (child.tab !== undefined) {
    return child.tab ? activeTab === child.tab : !activeTab;
  }
  return false;
}

function renderNavItem(
  item: NavItem,
  pathname: string,
  searchParams: { get: (key: string) => string | null },
  collapsed?: boolean
) {
  const Icon = item.icon;
  const isActive = checkIsItemActive(item.href, pathname, searchParams);

  const parentClass = isActive
    ? "bg-[#1a1a1d] text-white shadow-sm font-semibold"
    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1d] hover:text-gray-900 dark:hover:text-gray-200 font-medium";

  if (collapsed) {
    return (
      <div key={item.href} className="flex justify-center my-0.5">
        <Link
          href={item.href}
          title={item.children ? `${item.label} (${item.children.map(c => c.label).join(", ")})` : item.label}
          className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${parentClass}`}
        >
          <Icon className="h-[17px] w-[17px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.7} />
        </Link>
      </div>
    );
  }

  return (
    <div key={item.href} className="space-y-0.5">
      <Link
        href={item.href}
        className={`group flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[12.5px] transition-all ${parentClass}`}
      >
        <Icon className="h-[17px] w-[17px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.7} />
        <span className="flex-1 truncate leading-tight">{item.label}</span>
        {item.children ? (
          <ChevronRight
            className={`h-3.5 w-3.5 opacity-60 transition-transform ${
              isActive ? "rotate-90" : ""
            }`}
          />
        ) : isActive ? (
          <ChevronRight className="h-3.5 w-3.5 opacity-40" />
        ) : null}
      </Link>

      {item.children && isActive && (
        <div className="pl-3 pr-1 space-y-0.5 my-0.5 border-l border-gray-200 dark:border-gray-800 ml-4">
          {item.children.map((child) => {
            const isChildActive = checkIsChildActive(child, searchParams);
            return (
              <Link
                key={child.href}
                href={child.href}
                className={`flex items-center py-1.5 px-2.5 text-[12px] font-medium rounded-lg transition-all ${
                  isChildActive
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1a1a1d] hover:text-gray-900 dark:hover:text-gray-200"
                }`}
              >
                <span className="truncate">{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

