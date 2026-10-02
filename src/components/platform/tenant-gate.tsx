"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { AlertTriangle, Lock, MessageCircle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SubscriptionInfo {
  status: string;
  expires_at: string | null;
  days_left: number | null;
  is_trial: boolean;
  banners: { expired: boolean; expiring_soon: boolean; maintenance_upcoming: boolean };
  upcoming_maintenance: { title: string; reason_message: string; starts_at: string; ends_at: string } | null;
  support_contact: { whatsapp: string; email: string };
  is_owner: boolean;
}

function pkt(d: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d)).replace(/\//g, "-").replace(",", "");
}

function FullScreen({ icon, title, message, children }: { icon: React.ReactNode; title: string; message: string; children?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f8f9fb] dark:bg-[#0a0a0b] p-6">
      <div className="max-w-md w-full text-center rounded-2xl bg-white dark:bg-[#111113] border border-gray-200 dark:border-[#1e1e21] shadow-sm p-8">
        <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-600">{icon}</div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-[14px] text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-line">{message}</p>
        {children}
      </div>
    </div>
  );
}

function SupportLinks({ contact }: { contact?: { whatsapp: string; email: string } | null }) {
  if (!contact || (!contact.whatsapp && !contact.email)) return null;
  const wa = (contact.whatsapp || "").replace(/[^\d]/g, "");
  return (
    <div className="flex flex-col gap-2 mt-5">
      {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"><MessageCircle className="h-4 w-4" /> WhatsApp support</Button></a>}
      {contact.email && <a href={`mailto:${contact.email}`} className="text-[13px] text-gray-500 hover:underline">{contact.email}</a>}
    </div>
  );
}

/**
 * Agency app access UI (architecture §6.2): expired banner + renew, expiry banner
 * (≤ 21 days), upcoming-maintenance banner, full-screen locked / maintenance pages.
 * The backend enforces all of this independently.
 */
export function TenantGate() {
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [blocked, setBlocked] = useState<{ code: string; message: string; maintenance?: any } | null>(null);
  const [unread, setUnread] = useState(0);
  const [contact, setContact] = useState<{ whatsapp: string; email: string } | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/subscription");
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && data.code === "SESSION_REVOKED") return signOut({ callbackUrl: "/login" });
      if (res.status === 503 || (res.status === 403 && ["ACCOUNT_SUSPENDED", "ACCOUNT_OFFBOARDED"].includes(data.code))) {
        setBlocked({ code: data.code, message: data.message, maintenance: data.maintenance });
        if (!contact) fetch("/api/public/config").then((r) => r.json()).then((c) => setContact(c.support_contact)).catch(() => {});
        return;
      }
      if (res.ok) {
        setBlocked(null);
        setInfo(data);
      }
    } catch {
      /* network blip */
    }
  }, [contact]);

  useEffect(() => {
    check();
    const t = setInterval(() => document.visibilityState === "visible" && check(), 60_000);
    return () => clearInterval(t);
  }, [check]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/tenant/support/unread-count").then((r) => (r.ok ? r.json() : null)).then((r) => r && setUnread(r.unread)).catch(() => {});
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  if (blocked?.code === "MAINTENANCE") {
    const m = blocked.maintenance;
    return (
      <FullScreen icon={<Wrench className="h-6 w-6" />} title={m?.title || "Scheduled maintenance"} message={m?.reason_message || blocked.message}>
        {m && <p className="text-[13px] text-gray-500 mt-3">{pkt(m.starts_at)} – {pkt(m.ends_at)} (PKT)</p>}
        <Button variant="outline" className="mt-5" onClick={() => window.location.reload()}>Try again</Button>
      </FullScreen>
    );
  }
  if (blocked) {
    return (
      <FullScreen icon={<Lock className="h-6 w-6" />} title={blocked.code === "ACCOUNT_SUSPENDED" ? "Account suspended" : "Account closed"} message={blocked.message}>
        <SupportLinks contact={contact} />
        <Button variant="ghost" className="mt-3" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</Button>
      </FullScreen>
    );
  }
  if (!info) return null;

  return (
    <div className="space-y-2 mb-3">
      {info.banners.expired && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-4 py-2.5 text-[13px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">Your subscription has expired. You can view and export your data. Creating or editing records is disabled until you renew.</span>
          <Link href="/dashboard/subscription"><Button size="sm" className="h-8 bg-amber-600 hover:bg-amber-700 text-white">Renew</Button></Link>
        </div>
      )}
      {info.banners.expiring_soon && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/30 px-4 py-2 text-[13px] text-blue-900 dark:text-blue-200">
          <span className="flex-1">Your {info.is_trial ? "trial" : "subscription"} ends in <b>{info.days_left} day{info.days_left === 1 ? "" : "s"}</b>.</span>
          <Link href="/dashboard/subscription"><Button size="sm" variant="outline" className="h-8">{info.is_trial ? "Upgrade" : "Renew"}</Button></Link>
        </div>
      )}
      {info.banners.maintenance_upcoming && info.upcoming_maintenance && (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white dark:bg-[#111113] dark:border-[#1e1e21] px-4 py-2 text-[13px]">
          <Wrench className="h-4 w-4 text-gray-500" />
          <span><b>{info.upcoming_maintenance.title}</b>: {pkt(info.upcoming_maintenance.starts_at)} – {pkt(info.upcoming_maintenance.ends_at)} PKT. {info.upcoming_maintenance.reason_message}</span>
        </div>
      )}
      {unread > 0 && (
        <Link href="/dashboard/support" className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-red-600 text-white px-4 py-2 text-[13px] shadow-lg">
          <MessageCircle className="h-4 w-4" /> {unread} new support repl{unread === 1 ? "y" : "ies"}
        </Link>
      )}
    </div>
  );
}
