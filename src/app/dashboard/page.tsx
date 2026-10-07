"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, Wallet, Receipt, ArrowRight, BarChart3, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import Link from "next/link";
import { apiFetch, notify } from "@/lib/notify";

interface Stats {
  invoices: number;
  customers: number;
  payments: number;
  expenses: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function load() {
      type Count = { total?: number };
      let inv: Count, cust: Count, pay: Count, exp: Count;
      try {
        [inv, cust, pay, exp] = await Promise.all([
          apiFetch<Count>("/api/invoices?limit=1"),
          apiFetch<Count>("/api/customers?limit=1"),
          apiFetch<Count>("/api/payments?limit=1"),
          apiFetch<Count>("/api/expenses?limit=1"),
        ]);
      } catch (e) {
        notify.error("Failed to load dashboard figures", e);
        return;
      }
      setStats({
        invoices: inv.total || 0,
        customers: cust.total || 0,
        payments: pay.total || 0,
        expenses: exp.total || 0,
      });
    }
    load();
  }, []);

  const cards = [
    {
      title: "Total Invoices", value: stats?.invoices ?? "-", icon: FileText,
      color: "text-blue-600 dark:text-blue-400",
      iconBg: "bg-blue-100 dark:bg-blue-500/10",
      trend: "+12%", trendUp: true,
    },
    {
      title: "Customers", value: stats?.customers ?? "-", icon: Users,
      color: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-100 dark:bg-emerald-500/10",
      trend: "+3", trendUp: true,
    },
    {
      title: "Payments", value: stats?.payments ?? "-", icon: Wallet,
      color: "text-violet-600 dark:text-violet-400",
      iconBg: "bg-violet-100 dark:bg-violet-500/10",
      trend: "+8%", trendUp: true,
    },
    {
      title: "Expenses", value: stats?.expenses ?? "-", icon: Receipt,
      color: "text-rose-600 dark:text-rose-400",
      iconBg: "bg-rose-100 dark:bg-rose-500/10",
      trend: "-5%", trendUp: false,
    },
  ];

  const quickActions = [
    { href: "/dashboard/invoices?type=Ticket", label: "Create New Invoice", desc: "Generate a draft invoice", icon: FileText, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-500/10" },
    { href: "/dashboard/payments", label: "Record Payment", desc: "Log a customer payment", icon: Wallet, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-500/10" },
    { href: "/dashboard/expenses", label: "Add Expense", desc: "Submit a new expense", icon: Receipt, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-500/10" },
    { href: "/dashboard/customers", label: "Add Customer", desc: "Register a new customer", icon: Users, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-500/10" },
  ];

  const reports = [
    { href: "/dashboard/reports?type=pnl", label: "Profit & Loss", desc: "Revenue vs expenses breakdown", icon: BarChart3, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-500/10" },
    { href: "/dashboard/reports?type=aging", label: "Dues & Aging", desc: "Outstanding customer balances", icon: Clock, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-500/10" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Dashboard</h1>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Overview of your finance operations</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          const TrendIcon = card.trendUp ? ArrowUpRight : ArrowDownRight;
          return (
            <Card key={card.title} className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[12px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">{card.title}</p>
                    <p className="text-3xl font-bold tracking-tight mt-2 text-gray-900 dark:text-gray-50">{card.value}</p>
                    <div className={`flex items-center gap-1 mt-2 text-[11px] font-medium ${card.trendUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      <TrendIcon className="h-3 w-3" />
                      {card.trend}
                    </div>
                  </div>
                  <div className={`h-10 w-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${card.color}`} strokeWidth={1.8} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions & Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
          <CardHeader className="pb-2 px-6 pt-5">
            <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center gap-3.5 p-4 rounded-xl border border-gray-100 dark:border-[#1e1e21] hover:border-gray-200 dark:hover:border-[#2a2a2d] bg-gray-50/50 dark:bg-[#0e0e10] hover:bg-gray-50 dark:hover:bg-[#151517] transition-all group"
                  >
                    <div className={`h-10 w-10 rounded-xl ${action.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`h-5 w-5 ${action.color}`} strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{action.label}</p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{action.desc}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
          <CardHeader className="pb-2 px-6 pt-5">
            <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50">Reports</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-5 space-y-3">
            {reports.map((report) => {
              const Icon = report.icon;
              return (
                <Link
                  key={report.href}
                  href={report.href}
                  className="flex items-center gap-3.5 p-4 rounded-xl border border-gray-100 dark:border-[#1e1e21] hover:border-gray-200 dark:hover:border-[#2a2a2d] bg-gray-50/50 dark:bg-[#0e0e10] hover:bg-gray-50 dark:hover:bg-[#151517] transition-all group"
                >
                  <div className={`h-10 w-10 rounded-xl ${report.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`h-5 w-5 ${report.color}`} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{report.label}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{report.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
