"use client";

import { useState } from "react";
import { ActionSpec, api, dmy } from "@/components/platform/kit";

export interface AgencyRow {
  _id: string;
  name: string;
  email: string;
  owner: { name: string; email: string; phone: string };
  status: string;
  source: string;
  access_expires_at: string | null;
  days_left: number | null;
  paused_days_remaining: number | null;
  seat_limit: number;
  branch_limit: number;
  user_count: number;
  branches_used: number;
  sales_owner_name: string | null;
  sales_owner_id: string | null;
  marketing_consent: boolean;
  possible_duplicate: boolean;
  last_active_at: string | null;
  created_at: string;
}

export function AccessCell({ a }: { a: AgencyRow }) {
  if (a.status === "SUSPENDED") return <p className="text-[12px] font-medium text-red-600 dark:text-red-400">Paused — {a.paused_days_remaining ?? 0} days remaining</p>;
  if (!a.access_expires_at) return <p className="text-[12px] text-gray-400">No expiry</p>;
  const d = a.days_left ?? 0;
  return (
    <>
      <p className={`text-[12px] font-medium ${d <= 0 ? "text-red-600 dark:text-red-400" : d <= 7 ? "text-amber-600" : "text-gray-600 dark:text-gray-300"}`}>
        {d < 0 ? `Expired ${-d}d ago` : d === 0 ? "Expires today" : `${d} days left`}
      </p>
      <p className="text-[10px] text-gray-400 font-mono">{dmy(a.access_expires_at)}</p>
    </>
  );
}

export function useAgencyActions(reload: () => void) {
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const done = () => reload();
  const suspend = (a: { _id: string; name: string }) =>
    setSpec({
      title: `Suspend ${a.name}`,
      description: "All sessions end immediately and the subscription clock pauses until the agency is activated again.",
      fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }],
      danger: true,
      confirmLabel: "Suspend",
      run: (v) => api(`/api/admin/agencies/${a._id}/toggle`, { body: { action: "suspend", reason: v.reason } }),
      onDone: done,
    });
  const activate = (a: { _id: string; name: string }) =>
    setSpec({
      title: `Activate ${a.name}`,
      description: "Expiry moves forward by the time spent suspended (if the clock was running).",
      fields: [{ name: "reason", label: "Note", type: "textarea" }],
      confirmLabel: "Activate",
      run: (v) => api(`/api/admin/agencies/${a._id}/toggle`, { body: { action: "activate", reason: v.reason } }),
      onDone: done,
    });
  const extend = (a: { _id: string; name: string }) =>
    setSpec({
      title: `Complimentary extension — ${a.name}`,
      description: "Free days (not a paid renewal). Paid extensions go through Orders.",
      fields: [
        { name: "days", label: "Days", type: "number", required: true, defaultValue: "7" },
        { name: "reason", label: "Reason", type: "textarea", required: true },
      ],
      confirmLabel: "Extend",
      run: (v) => api(`/api/admin/agencies/${a._id}/extend`, { body: { days: Number(v.days), reason: v.reason } }),
      onDone: done,
    });
  const offboard = (a: { _id: string; name: string }) =>
    setSpec({
      title: `Offboard ${a.name}`,
      description: "Agency users are locked out. Data stays in the live database until the retention period ends, then it moves to cold storage.",
      fields: [
        { name: "offboard_reason", label: "Reason", type: "select", options: ["PAUSED", "LEFT", "NON_PAYMENT", "OTHER"], required: true, defaultValue: "PAUSED" },
        { name: "retention_months", label: "Retention (months)", type: "number", defaultValue: "12" },
        { name: "note", label: "Note", type: "textarea" },
        { name: "notify", label: "Notify owner", type: "checkbox", defaultValue: true, placeholder: "Send the offboarding notice email" },
      ],
      danger: true,
      confirmLabel: "Offboard",
      run: (v) => api(`/api/admin/agencies/${a._id}/offboard`, { body: { offboard_reason: v.offboard_reason, retention_months: Number(v.retention_months) || undefined, note: v.note, notify: v.notify } }),
      onDone: done,
    });
  return { spec, setSpec, suspend, activate, extend, offboard };
}

