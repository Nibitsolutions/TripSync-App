"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Save, Loader2, CheckCircle, Building2, Globe, Phone, Mail, MapPin, FileText } from "lucide-react";
import { apiFetch, notify } from "@/lib/notify";
import { BankAccountsCard } from "@/components/settings/BankAccountsCard";

interface AgencySettings {
  name: string;
  logo_url: string;
  address: string;
  city: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  tagline: string;
  invoice_notes: string;
  base_currency: string;
}

const empty: AgencySettings = {
  name: "", logo_url: "", address: "", city: "", contact_person: "",
  contact_email: "", contact_phone: "", website: "", tagline: "",
  invoice_notes: "", base_currency: "PKR",
};

export default function SettingsPage() {
  const [form, setForm] = useState<AgencySettings>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<{ settings?: Partial<AgencySettings> }>("/api/settings")
      .then((d) => {
        if (d.settings) setForm({ ...empty, ...d.settings });
      })
      .catch((e) => notify.error("Failed to load agency settings", e))
      .finally(() => setLoading(false));
  }, []);

  function set(field: keyof AgencySettings, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: form });
      notify.success("Agency settings saved");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      notify.error("Failed to save agency settings", e);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">Agency Settings</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">Configure your agency profile and invoice branding</p>
        </div>
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="space-y-6">
        {/* Agency Identity */}
        <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
          <CardHeader className="px-6 pt-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Agency Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Agency Name</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="TripSync Travel Agency" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Tagline / Slogan</Label>
                <Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Your Journey, Our Expertise" className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Logo URL</Label>
              <Input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://yoursite.com/logo.png" className="h-10" />
              {form.logo_url && (
                <div className="mt-2 p-3 rounded-lg border border-gray-100 dark:border-[#1e1e21] bg-gray-50 dark:bg-[#0e0e10] inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.logo_url} alt="Agency logo preview" className="h-14 object-contain" />
                </div>
              )}
            </div>
            {/* Invoice numbers use a fixed prefix per invoice type (TCK-, HTL-, …), so there is no prefix setting */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Base Currency</Label>
                <Input value={form.base_currency} onChange={(e) => set("base_currency", e.target.value)} placeholder="PKR" className="h-10 font-mono" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact & Address */}
        <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
          <CardHeader className="px-6 pt-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Contact & Address
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Street Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Office #12, Travel Tower, Main Boulevard" className="h-10" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[13px]">City</Label>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Lahore, Pakistan" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Contact Person</Label>
                <Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} placeholder="Muhammad Ali" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[13px] flex items-center gap-1.5"><Phone className="h-3 w-3" /> Phone</Label>
                <Input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="+92 300 0000000" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] flex items-center gap-1.5"><Mail className="h-3 w-3" /> Email</Label>
                <Input value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} placeholder="info@agency.com" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] flex items-center gap-1.5"><Globe className="h-3 w-3" /> Website</Label>
                <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="www.agency.com" className="h-10" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Banks & Cash (voucher Bank / Source list) — saves on its own, not with the form */}
        <BankAccountsCard />

        {/* Invoice Footer Notes */}
        <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
          <CardHeader className="px-6 pt-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Invoice Footer / Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Footer text (appears on every printed invoice)</Label>
              <Textarea
                value={form.invoice_notes}
                onChange={(e) => set("invoice_notes", e.target.value)}
                placeholder={"Thank you for your business!\nBank: HBL | Account: 12345678 | IBAN: PK00HBL0000000000"}
                className="min-h-[100px] text-[13px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Invoice Preview */}
        <Card className="bg-white dark:bg-[#111113] border-gray-200/80 dark:border-[#1e1e21] shadow-sm">
          <CardHeader className="px-6 pt-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" /> Invoice Header Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="rounded-xl border border-gray-200 dark:border-[#1e1e21] p-5 bg-white dark:bg-[#0e0e10]">
              <div className="flex items-start justify-between">
                <div>
                  {form.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logo_url} alt="logo" className="h-12 object-contain mb-2" />
                  )}
                  <p className="font-bold text-lg text-gray-900 dark:text-gray-50">{form.name || "Your Agency Name"}</p>
                  {form.tagline && <p className="text-[12px] text-gray-400 mt-0.5">{form.tagline}</p>}
                </div>
                <div className="text-right text-[12px] text-gray-500 dark:text-gray-400 space-y-0.5">
                  {form.address && <p>{form.address}</p>}
                  {form.city && <p>{form.city}</p>}
                  {form.contact_phone && <p>{form.contact_phone}</p>}
                  {form.contact_email && <p>{form.contact_email}</p>}
                  {form.website && <p>{form.website}</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} size="lg" className="gap-2 min-w-[160px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}