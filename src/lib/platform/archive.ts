import mongoose, { Types } from "mongoose";
import path from "path";
import { promises as fs } from "fs";
import zlib from "zlib";
import { promisify } from "util";
import "@/models";
import Tenant from "@/models/Tenant";
import User from "@/models/User";
import { TenantArchive } from "@/models/platform";
import { decryptBuffer, encryptBuffer, sha256 } from "./crypto";
import { invalidateAgency, normalizeStatus } from "./lifecycle";
import { systemActor, writeAudit } from "./audit";
import { enqueueEmail, templates } from "./email";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const EJSON = mongoose.mongo.BSON.EJSON;
export const SCHEMA_VERSION = 1;

export function archiveDir() {
  return process.env.ARCHIVE_DIR || path.join(process.cwd(), "storage", "archives");
}

/**
 * Tenant-scoped collections = every registered model with a `tenant_id` path
 * (the agency's business data) — users included. Platform account records
 * (orders, receipts, tickets) stay as metadata.
 */
export function tenantScopedModels() {
  return Object.values(mongoose.models).filter((m) => m.schema.path("tenant_id"));
}

export async function estimateAgencyRows(agencyId: Types.ObjectId | string) {
  let rows = 0;
  for (const m of tenantScopedModels()) rows += await m.countDocuments({ tenant_id: agencyId });
  return rows;
}

interface ExportResult {
  buffer: Buffer;
  manifest: { tables: Record<string, { rows: number; sha256: string }>; schema_version: number; app_version: string; created_at: string; agency_id: string };
}

async function exportAgency(agencyId: Types.ObjectId): Promise<ExportResult> {
  const tables: ExportResult["manifest"]["tables"] = {};
  const chunks: string[] = [];
  for (const m of tenantScopedModels()) {
    const docs = await m.collection.find({ tenant_id: agencyId }).toArray();
    const lines = docs.map((d) => JSON.stringify({ t: m.collection.collectionName, d: EJSON.serialize(d) }));
    tables[m.collection.collectionName] = { rows: docs.length, sha256: sha256(lines.join("\n")) };
    chunks.push(...lines);
  }
  const manifest = {
    tables,
    schema_version: SCHEMA_VERSION,
    app_version: process.env.npm_package_version || "0.1.0",
    created_at: new Date().toISOString(),
    agency_id: String(agencyId),
  };
  const ndjson = [JSON.stringify({ manifest }), ...chunks].join("\n");
  const buffer = encryptBuffer(await gzip(Buffer.from(ndjson, "utf8")));
  return { buffer, manifest };
}

async function readSnapshot(objectKey: string) {
  const buf = await fs.readFile(path.join(archiveDir(), objectKey));
  const fileSha = sha256(buf);
  const text = (await gunzip(decryptBuffer(buf))).toString("utf8");
  const lines = text.split("\n");
  const head = JSON.parse(lines[0]) as { manifest: ExportResult["manifest"] };
  const byTable: Record<string, string[]> = {};
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const { t } = JSON.parse(line) as { t: string };
    (byTable[t] ??= []).push(line);
  }
  return { fileSha, manifest: head.manifest, byTable };
}

/** Export → encrypt → write → verify (checksum + row counts). Returns the archive row. */
export async function snapshotAgency(agencyId: string, kind: "COLD_STORAGE" | "MANUAL_EXPORT", forceMismatch = false) {
  const id = new Types.ObjectId(agencyId);
  const archive = await TenantArchive.create({ agency_id: id, kind, status: "RUNNING", schema_version: SCHEMA_VERSION });
  try {
    const { buffer, manifest } = await exportAgency(id);
    const objectKey = `${agencyId}/${archive._id}.ndjson.gz.enc`;
    await fs.mkdir(path.join(archiveDir(), agencyId), { recursive: true });
    await fs.writeFile(path.join(archiveDir(), objectKey), buffer);
    const expectedSha = forceMismatch ? "0".repeat(64) : sha256(buffer);

    // Verification: re-read the object and compare with the source.
    const check = await readSnapshot(objectKey);
    const problems: string[] = [];
    if (check.fileSha !== expectedSha) problems.push("checksum mismatch");
    for (const [table, info] of Object.entries(manifest.tables)) {
      const lines = check.byTable[table] ?? [];
      if (lines.length !== info.rows) problems.push(`${table}: row count ${lines.length} ≠ ${info.rows}`);
      else if (sha256(lines.join("\n")) !== info.sha256) problems.push(`${table}: content hash mismatch`);
      const m = tenantScopedModels().find((x) => x.collection.collectionName === table);
      if (m) {
        const live = await m.countDocuments({ tenant_id: id });
        if (live !== info.rows) problems.push(`${table}: live rows changed during export`);
      }
    }
    if (problems.length) throw new Error(`Verification failed: ${problems.join("; ")}`);

    archive.status = "VERIFIED";
    archive.object_key = objectKey;
    archive.size_bytes = buffer.length;
    archive.sha256 = expectedSha;
    archive.manifest = manifest;
    archive.verified_at = new Date();
    await archive.save();
    return archive.toObject();
  } catch (err) {
    archive.status = "FAILED";
    archive.error = (err as Error).message?.slice(0, 1000) ?? "failed";
    await archive.save();
    throw err;
  }
}

/** Releases live tenant rows — only after a VERIFIED snapshot (§7.9). */
export async function moveToColdStorage(agencyId: string, forceMismatch = false) {
  const agency = await Tenant.findById(agencyId);
  if (!agency || normalizeStatus(agency.status) !== "OFFBOARDED") throw new Error("Agency is not offboarded");
  let archive;
  try {
    archive = await snapshotAgency(agencyId, "COLD_STORAGE", forceMismatch);
  } catch (err) {
    await alertSuperAdmins(`Archive failed for ${agency.name}`, `Live data was left untouched and the agency stays OFFBOARDED. The job retries tomorrow. Error: ${(err as Error).message}`, `archive-fail:${agencyId}:${new Date().toISOString().slice(0, 10)}`);
    await writeAudit(systemActor, { action: "archive.snapshot_failed", entity_type: "agency", entity_id: agencyId, agency_id: agencyId, reason: (err as Error).message });
    throw err;
  }
  const id = new Types.ObjectId(agencyId);
  const released: Record<string, number> = {};
  for (const m of tenantScopedModels()) {
    const r = await m.collection.deleteMany({ tenant_id: id });
    released[m.collection.collectionName] = r.deletedCount ?? 0;
  }
  agency.status = "COLD_STORAGE";
  agency.cold_storage_at = new Date();
  agency.session_epoch = (agency.session_epoch ?? 0) + 1;
  await agency.save();
  invalidateAgency(agencyId);
  await writeAudit(systemActor, { action: "archive.cold_storage", entity_type: "agency", entity_id: agencyId, agency_id: agencyId, after: { archive_id: archive._id, released } });
  await alertSuperAdmins(`Archive completed for ${agency.name}`, `A verified snapshot was stored and live rows were released. Choose RETAIN or DELETE in the Archive module.`, `archive-done:${archive._id}`);
  return archive;
}

/** Re-imports rows with original ids; fails safely (no writes) on any id collision. Agency → EXPIRED. */
export async function restoreFromArchive(archiveId: string) {
  const archive = await TenantArchive.findById(archiveId);
  if (!archive || archive.status !== "VERIFIED" || !archive.object_key) throw new Error("Archive is not restorable");
  const snap = await readSnapshot(archive.object_key);
  if (snap.fileSha !== archive.sha256) throw new Error("Snapshot checksum does not match the recorded value");
  const docsByTable: Record<string, Record<string, unknown>[]> = {};
  for (const [table, lines] of Object.entries(snap.byTable)) {
    docsByTable[table] = lines.map((l) => EJSON.deserialize((JSON.parse(l) as { d: Record<string, unknown> }).d) as Record<string, unknown>);
  }
  // Collision check before any write.
  for (const [table, docs] of Object.entries(docsByTable)) {
    if (!docs.length) continue;
    const coll = mongoose.connection.collection(table);
    const clash = await coll.countDocuments({ _id: { $in: docs.map((d) => d._id as Types.ObjectId) } });
    if (clash) throw new Error(`Restore aborted: ${clash} row(s) in ${table} already exist`);
  }
  const counts: Record<string, number> = {};
  for (const [table, docs] of Object.entries(docsByTable)) {
    if (docs.length) await mongoose.connection.collection(table).insertMany(docs, { ordered: true });
    counts[table] = docs.length;
  }
  for (const [table, info] of Object.entries(snap.manifest.tables)) {
    if ((counts[table] ?? 0) !== info.rows) throw new Error(`Restore count mismatch on ${table}`);
  }
  const agency = await Tenant.findById(archive.agency_id);
  if (agency) {
    agency.status = "EXPIRED";
    agency.cold_storage_at = null;
    agency.offboarded_at = null;
    agency.retention_until = null;
    agency.access_expires_at = agency.access_expires_at && agency.access_expires_at < new Date() ? agency.access_expires_at : new Date();
    await agency.save();
    invalidateAgency(String(agency._id));
  }
  archive.restored_at = new Date();
  await archive.save();
  return { counts };
}

export async function deleteSnapshot(archiveId: string) {
  const archive = await TenantArchive.findById(archiveId);
  if (!archive) throw new Error("Archive not found");
  if (archive.object_key) await fs.rm(path.join(archiveDir(), archive.object_key), { force: true });
  archive.status = "DELETED";
  archive.decision = "DELETED";
  await archive.save();
  return archive;
}

export async function alertSuperAdmins(title: string, message: string, key: string) {
  const admins = await User.find({ role: "SuperAdmin", is_active: { $ne: false } }).select("email").lean();
  const t = await templates.systemAlert(title, message);
  for (const a of admins) {
    await enqueueEmail({ to: a.email, ...t, category: "SYSTEM_ALERT", related_type: "alert", related_id: key, idempotency_key: `alert:${key}:${a._id}` });
  }
}
