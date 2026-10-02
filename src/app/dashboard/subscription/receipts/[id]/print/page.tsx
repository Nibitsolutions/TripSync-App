"use client";

import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNote, Loading, useApi } from "@/components/platform/kit";
import { ReceiptView } from "@/components/platform/receipt-view";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function TenantReceiptPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useApi<any>(`/api/tenant/receipts/${id}`, [id]);
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:bg-white print:p-0">
      <div className="flex justify-end max-w-[720px] mx-auto mb-3 print:hidden">
        <Button onClick={() => window.print()} className="gap-1.5"><Printer className="h-4 w-4" /> Print / Save PDF</Button>
      </div>
      <ReceiptView receipt={data.receipt} seller={data.seller} />
    </div>
  );
}
