"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      totp,
      redirect: false,
    });

    if (res?.error === "TOTP_REQUIRED") {
      setNeedsTotp(true);
      setLoading(false);
    } else if (res?.error) {
      setError(res.error === "CredentialsSignin" ? "Invalid email or password" : res.error);
      setLoading(false);
    } else {
      // Fetch session to check role
      const sessionRes = await fetch("/api/auth/session");
      const session = await sessionRes.json();
      if (["SuperAdmin", "Manager", "SalesExecutive"].includes(session?.user?.role)) {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9fb] dark:bg-[#0a0a0b] p-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-xl bg-primary items-center justify-center mb-4">
            <span className="text-primary-foreground font-bold text-lg">TS</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">TripSync</h1>
          <p className="text-sm text-muted-foreground mt-1">Finance Management System</p>
        </div>

        <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">
                  {error}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px] font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ahmed@tripsync.pk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[13px] font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10"
                />
              </div>
              {needsTotp && (
                <div className="space-y-1.5">
                  <Label htmlFor="totp" className="text-[13px] font-medium">Authentication code</Label>
                  <Input
                    id="totp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code from your authenticator app"
                    value={totp}
                    onChange={(e) => setTotp(e.target.value)}
                    autoFocus
                    className="h-10 font-mono tracking-widest"
                  />
                </div>
              )}
              <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
                ) : (
                  <><LogIn className="h-4 w-4" /> Sign In</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-[12px] text-center mt-4 space-x-3">
          <a href="/set-password" className="text-muted-foreground hover:underline">Forgot password?</a>
          <a href="/trial" className="text-muted-foreground hover:underline">Start a free trial</a>
        </div>
        <div className="text-[11px] text-center text-muted-foreground mt-4 space-y-0.5">
          <p>Super Admin: admin@tripsync.pk / superadmin123</p>
          <p>Agency: ahmed@tripsync.pk / password123</p>
        </div>
      </div>
    </div>
  );
}
