"use client";

import { useEffect } from "react";

interface PrintButtonsProps {
  title?: string;
}

export default function PrintButtons({ title }: PrintButtonsProps) {
  useEffect(() => {
    if (title) {
      document.title = title;
    }
  }, [title]);

  const handlePrint = () => {
    if (title) {
      document.title = title;
    }
    window.print();
  };

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50, display: "flex", gap: 8 }} className="no-print">
      <button
        onClick={handlePrint}
        style={{ padding: "8px 16px", background: "#111827", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid #111827" }}
      >
        Print / Save PDF
      </button>
      <button
        onClick={() => window.close()}
        style={{ padding: "8px 16px", background: "#fff", color: "#374151", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid #e5e7eb" }}
      >
        Close
      </button>
    </div>
  );
}