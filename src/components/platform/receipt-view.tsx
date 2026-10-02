"use client";

import { dmy, pkr } from "./kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ReceiptView({ receipt, seller }: { receipt: any; seller?: any }) {
  const d = receipt.details ?? {};
  return (
    <div className="max-w-[720px] mx-auto bg-white text-gray-900 p-8 border border-gray-200 rounded-xl print:border-0 print:rounded-none">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{seller?.seller_name || "TripSync"}</h1>
          {seller?.seller_address && <p className="text-[12px] text-gray-500 whitespace-pre-line">{seller.seller_address}</p>}
          {seller?.enabled && seller?.seller_ntn && <p className="text-[12px] text-gray-500">NTN: {seller.seller_ntn}</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Receipt</p>
          <p className="text-lg font-mono font-semibold">{receipt.receipt_number}</p>
          <p className="text-[12px] text-gray-500">{dmy(receipt.issued_at)}</p>
          {receipt.voided_at && <p className="text-[12px] font-bold text-red-600 mt-1">VOID — {receipt.void_reason}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-[13px] mb-6">
        <div>
          <p className="text-[11px] uppercase text-gray-400 font-semibold">Billed to</p>
          <p className="font-semibold">{d.agency_name}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-gray-400 font-semibold">Plan</p>
          <p>{d.seats} seats · {d.branches} branch{d.branches > 1 ? "es" : ""} · {d.term}</p>
          {d.period && <p className="text-gray-500">Period: {d.period}</p>}
        </div>
      </div>
      <table className="w-full text-[13px]">
        <tbody>
          {receipt.lines.map((l: any, i: number) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2">{l.label}</td>
              <td className="py-2 text-right font-mono">{l.amount < 0 ? `− ${pkr(-l.amount)}` : pkr(l.amount)}</td>
            </tr>
          ))}
          <tr>
            <td className="py-3 font-bold">Total paid</td>
            <td className="py-3 text-right font-mono font-bold">{pkr(receipt.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[12px] text-gray-500 mt-4">
        Payment method: {d.payment_method} · Reference: <span className="font-mono">{d.payment_reference}</span> · Order: <span className="font-mono">{d.order_number}</span>
      </p>
    </div>
  );
}
