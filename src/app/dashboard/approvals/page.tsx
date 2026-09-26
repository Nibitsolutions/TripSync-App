"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Check, X, ShieldAlert, Receipt, Loader2, Clock, CheckCircle } from "lucide-react";
import { formatDateDDMMYYYY } from "@/lib/date-utils";

interface ApprovalRequest {
  _id: string;
  type: "CreditLimitOverride" | "ExpenseApproval";
  related_entity_id: string;
  requested_by: { name: string; email: string };
  resolved_by: { name: string; email: string } | null;
  status: "Pending" | "Approved" | "Rejected";
  created_at: string;
  resolved_at: string | null;
  details: {
    amount: number;
    description?: string;
    type_name?: string;
    invoice_number?: string;
    currency?: string;
    customer_name?: string;
    credit_limit?: number;
    current_balance?: number;
  } | null;
}

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/approval-requests");
      const data = await res.json();
      setRequests(data.approval_requests || []);
    } catch (err) {
      console.error("Failed to load approval requests:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string, decision: "approve" | "reject") {
    setResolvingId(id);
    try {
      const res = await fetch(`/api/approval-requests/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to resolve request");
      } else {
        load();
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred");
    } finally {
      setResolvingId(null);
    }
  }

  const userRole = (session?.user as { role?: string })?.role;
  const isManager = userRole === "Owner" || userRole === "Accountant";

  const pendingRequests = requests.filter((r) => r.status === "Pending");
  const historyRequests = requests.filter((r) => r.status !== "Pending");

  const statusStyles: Record<string, string> = {
    Approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    Rejected: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Approvals</h1>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Review and manage pending approval requests</p>
      </div>

      {/* Pending Approvals */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Pending Approvals ({pendingRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
                <CheckCircle className="h-7 w-7 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-1">All caught up!</p>
              <p className="text-[13px] text-gray-400 dark:text-gray-500 max-w-sm">
                No pending requests. Over-limit sales and certain expense types will appear here when submitted.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((req) => (
                <div
                  key={req._id}
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-gray-100 dark:border-[#1e1e21] bg-gray-50/50 dark:bg-[#0e0e10]/30 gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {req.type === "CreditLimitOverride" ? (
                        <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <Receipt className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-50">
                        {req.type === "CreditLimitOverride"
                          ? "Credit Limit Override Request"
                          : "Expense Approval Request"}
                      </p>
                      <div className="text-[12px] text-gray-500 dark:text-gray-400 space-y-1">
                        {req.type === "CreditLimitOverride" ? (
                          <>
                            <p>
                              Agent <span className="font-semibold">{req.requested_by?.name}</span> requested posting for{" "}
                              <span className="font-semibold">{req.details?.customer_name}</span>.
                            </p>
                            <p className="font-mono text-[11px] text-gray-400">
                              Invoice Amount: {req.details?.currency} {req.details?.amount?.toLocaleString()} | Customer Balance:{" "}
                              {req.details?.currency} {req.details?.current_balance?.toLocaleString()} | Credit Limit:{" "}
                              {req.details?.currency} {req.details?.credit_limit?.toLocaleString() || "None"}
                            </p>
                          </>
                        ) : (
                          <>
                            <p>
                              Submitted by <span className="font-semibold">{req.requested_by?.name}</span> for{" "}
                              <span className="font-semibold">{req.details?.type_name}</span>.
                            </p>
                            <p className="font-mono text-[11px] text-gray-400">
                              Amount: PKR {req.details?.amount?.toLocaleString()} | Description: {req.details?.description || "None"}
                            </p>
                          </>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1">
                          Submitted on {new Date(req.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 text-[12px] border-gray-200 hover:border-red-200 dark:border-[#1e1e21] dark:hover:border-red-500/30 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 cursor-pointer"
                      disabled={!isManager || resolvingId !== null}
                      onClick={() => resolve(req._id, "reject")}
                    >
                      {resolvingId === req._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 gap-1.5 text-[12px] bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800 text-white cursor-pointer"
                      disabled={!isManager || resolvingId !== null}
                      onClick={() => resolve(req._id, "approve")}
                    >
                      {resolvingId === req._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
              {!isManager && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 p-3 rounded-lg mt-3">
                  Note: Resolving approvals requires accountant or owner permissions.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approvals History */}
      <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            History ({historyRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : historyRequests.length === 0 ? (
            <p className="text-center py-8 text-[13px] text-gray-400">No resolved requests in history.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 dark:border-[#1e1e21]">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Requested By</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 text-right">Amount</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Resolved By</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRequests.map((req) => (
                    <TableRow key={req._id} className="border-gray-100 dark:border-[#1e1e21] hover:bg-gray-50/50 dark:hover:bg-[#151517]">
                      <TableCell className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        {req.type === "CreditLimitOverride" ? "Credit Limit Override" : "Expense Approval"}
                      </TableCell>
                      <TableCell className="text-[13px] text-gray-600 dark:text-gray-300">
                        {req.requested_by?.name || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        {req.type === "CreditLimitOverride"
                          ? `${req.details?.currency} ${req.details?.amount?.toLocaleString()}`
                          : `PKR ${req.details?.amount?.toLocaleString()}`}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusStyles[req.status] || ""}`}>
                          {req.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-[13px] text-gray-500">
                        {req.resolved_by?.name || "-"}
                      </TableCell>
                      <TableCell className="text-[13px] text-gray-500 font-mono">
                        {req.resolved_at ? formatDateDDMMYYYY(req.resolved_at) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
