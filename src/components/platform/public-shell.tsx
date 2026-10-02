import Link from "next/link";

export function PublicShell({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-[#f8f9fb] dark:bg-[#0a0a0b] py-10 px-4">
      <div className={`mx-auto ${wide ? "max-w-4xl" : "max-w-md"}`}>
        <Link href="/" className="flex items-center justify-center gap-2 mb-6">
          <span className="inline-flex h-10 w-10 rounded-xl bg-primary items-center justify-center text-primary-foreground font-bold">TS</span>
          <span className="text-lg font-semibold">TripSync</span>
        </Link>
        <div className="rounded-2xl bg-white dark:bg-[#111113] border border-gray-200 dark:border-[#1e1e21] shadow-sm p-6 sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-gray-500 mt-1 mb-5">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Hidden honeypot input — bots fill it, people never see it. */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
      <label>
        Website
        <input tabIndex={-1} autoComplete="off" name="website" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}
