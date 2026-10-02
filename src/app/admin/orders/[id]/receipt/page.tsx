"use client";

import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNote, Loading, useApi } from "@/components/platform/kit";
import { ReceiptView } from "@/components/platform/receipt-view";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AdminReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useApi<any>(`/api/admin/orders/${id}`, [id]);
  const seller = useApi<any>("/api/admin/settings");
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!data?.receipt) return <ErrorNote message="No receipt for this order yet." />;
  return (
    <div>
      <div className="flex justify-end mb-3 print:hidden">
        <Button onClick={() => window.print()} className="gap-1.5"><Printer className="h-4 w-4" /> Print / Save PDF</Button>
      </div>
      <ReceiptView receipt={data.receipt} seller={seller.data?.settings?.receipt_tax} />
    </div>
  );
}
