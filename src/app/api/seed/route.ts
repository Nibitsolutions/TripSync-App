import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { Tenant, User, Customer, ExpenseType, TaxCode, ExchangeRate } from "@/models";
import { PriceBook } from "@/models/platform";

// GET /api/seed - Seed demo data (remove in production)
export async function GET() {
  await connectDB();

  // Create SuperAdmin if not exists
  const existingSA = await User.findOne({ role: "SuperAdmin" });
  if (!existingSA) {
    const saPassword = await bcrypt.hash("superadmin123", 10);
    await User.create({
      tenant_id: null,
      name: "Super Admin",
      email: "admin@tripsync.pk",
      password: saPassword,
      role: "SuperAdmin",
    });
  }

  // Default price book (illustrative values — change in Pricing & Promotions)
  if (!(await PriceBook.exists({}))) {
    await PriceBook.create({
      name: "Launch price book",
      effective_from: new Date(),
      base_monthly_fee: 3000,
      included_seats: 5,
      included_branches: 1,
      seat_monthly_rate: 500,
      branch_monthly_rate: 1500,
      note: "Seed values",
    });
  }

  // Check if already seeded
  const existing = await Tenant.findOne({ name: "TripSync Demo Agency" });
  if (existing) {
    return NextResponse.json({ message: "Already seeded", tenant_id: existing._id, superadmin: "admin@tripsync.pk / superadmin123" });
  }

  // Create tenant
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  const tenant = await Tenant.create({
    name: "TripSync Demo Agency",
    base_currency: "PKR",
    invoice_prefix: "TS",
    status: "ACTIVE",
    access_expires_at: expiryDate,
    owner_name: "Ahmed Khan",
    owner_email: "ahmed@tripsync.pk",
    source: "ADMIN_CREATED",
    max_users: 10,
    contact_person: "Ahmed Khan",
    contact_email: "ahmed@tripsync.pk",
    contact_phone: "021-1234567",
  });

  // Create users
  const hashedPassword = await bcrypt.hash("password123", 10);

  const owner = await User.create({
    tenant_id: tenant._id, name: "Ahmed Khan", email: "ahmed@tripsync.pk",
    password: hashedPassword, role: "Owner",
  });

  await User.create({
    tenant_id: tenant._id, name: "Sara Accountant", email: "sara@tripsync.pk",
    password: hashedPassword, role: "Accountant",
  });

  await User.create({
    tenant_id: tenant._id, name: "Ali Agent", email: "ali@tripsync.pk",
    password: hashedPassword, role: "Agent", default_commission_rate: 5,
  });

  await User.create({
    tenant_id: tenant._id, name: "Viewer User", email: "viewer@tripsync.pk",
    password: hashedPassword, role: "Viewer",
  });

  // Create customers
  await Customer.insertMany([
    { tenant_id: tenant._id, name: "Karachi Travels Ltd", contact_info: { phone: "021-1234567", email: "info@karachitravels.pk" }, credit_limit: 500000, created_by: owner._id, updated_by: owner._id },
    { tenant_id: tenant._id, name: "Lahore Tours Co", contact_info: { phone: "042-9876543", email: "info@lahoretours.pk" }, credit_limit: 300000, created_by: owner._id, updated_by: owner._id },
    { tenant_id: tenant._id, name: "Islamabad Holidays", contact_info: { phone: "051-5555555", email: "info@isbtours.pk" }, credit_limit: null, created_by: owner._id, updated_by: owner._id },
  ]);

  // Expense types
  await ExpenseType.insertMany([
    { tenant_id: tenant._id, name: "Office Rent", requires_approval: false, created_by: owner._id },
    { tenant_id: tenant._id, name: "Software Subscriptions", requires_approval: false, created_by: owner._id },
    { tenant_id: tenant._id, name: "Travel Reimbursement", requires_approval: true, created_by: owner._id },
    { tenant_id: tenant._id, name: "Marketing", requires_approval: true, created_by: owner._id },
  ]);

  // Tax codes
  await TaxCode.insertMany([
    { tenant_id: tenant._id, code: "GST-17", category: "FBR", rate: 17, active: true, created_by: owner._id },
    { tenant_id: tenant._id, code: "GST-0", category: "FBR", rate: 0, active: true, created_by: owner._id },
    { tenant_id: tenant._id, code: "BSP-TAX", category: "IATA_BSP", rate: 5, active: true, created_by: owner._id },
  ]);

  // Exchange rates
  await ExchangeRate.insertMany([
    { from_currency: "USD", to_currency: "PKR", rate: 278.50, source: "manual", fetched_at: new Date() },
    { from_currency: "GBP", to_currency: "PKR", rate: 352.00, source: "manual", fetched_at: new Date() },
    { from_currency: "SAR", to_currency: "PKR", rate: 74.25, source: "manual", fetched_at: new Date() },
    { from_currency: "AED", to_currency: "PKR", rate: 75.85, source: "manual", fetched_at: new Date() },
  ]);

  return NextResponse.json({
    message: "Seeded successfully",
    superadmin: { email: "admin@tripsync.pk", password: "superadmin123" },
    agency_login: { email: "ahmed@tripsync.pk", password: "password123" },
  });
}
