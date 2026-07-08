import fs from "fs";
import crypto from "crypto";
import type {
  SaveComparisonRequest,
  SavedComparisonRecord,
} from "../shared/savedComparison.js";
import { DATA_DIR } from "./dataPaths.js";
import path from "path";

const SAVED_COMPARISONS_FILE = path.join(DATA_DIR, "saved-comparisons.json");
const CODE_LENGTH = 8;
const MAX_SAVED = 500;

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll(): Record<string, SavedComparisonRecord> {
  if (!fs.existsSync(SAVED_COMPARISONS_FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(SAVED_COMPARISONS_FILE, "utf8")) as Record<
      string,
      SavedComparisonRecord
    >;
    return raw && typeof raw === "object" ? raw : {};
  } catch (err) {
    console.warn("[saved-comparisons] Could not read store, starting fresh:", err);
    return {};
  }
}

function persistAll(rows: Record<string, SavedComparisonRecord>): void {
  ensureDataDir();
  const sorted = Object.values(rows)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_SAVED);
  const next: Record<string, SavedComparisonRecord> = {};
  for (const row of sorted) next[row.code] = row;
  fs.writeFileSync(SAVED_COMPARISONS_FILE, JSON.stringify(next, null, 2), "utf8");
}

function newCode(existing: Record<string, SavedComparisonRecord>): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += alphabet[bytes[i]! % alphabet.length];
    }
    if (!existing[code]) return code;
  }
  return crypto.randomBytes(6).toString("hex");
}

function normalizePayload(input: SaveComparisonRequest): Omit<SavedComparisonRecord, "code" | "createdAt" | "updatedAt" | "label"> & { label: string } {
  const hospitalId = String(input.hospitalId ?? "").trim();
  if (!hospitalId) throw new Error("hospitalId is required");

  const compareWith = [...new Set(
    (input.compareWith ?? [])
      .map((id) => String(id).trim())
      .filter(Boolean)
      .filter((id) => id !== hospitalId),
  )].slice(0, 10);

  const peers = [...new Set((input.peers ?? []).map((p) => String(p).trim()).filter(Boolean))];
  const label = String(input.label ?? "").trim() || defaultLabel(hospitalId, compareWith.length);

  return {
    label,
    hospitalId,
    compareWith,
    peers,
    stateFilter: String(input.stateFilter ?? "").trim(),
    groupFilter: String(input.groupFilter ?? "all").trim() || "all",
    partner: input.partner ? String(input.partner).trim() : undefined,
  };
}

function defaultLabel(hospitalId: string, compareCount: number): string {
  if (compareCount > 0) return `Comparison · ${compareCount + 1} hospitals`;
  return `Hospital ${hospitalId}`;
}

export function getSavedComparison(code: string): SavedComparisonRecord | null {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;
  const row = loadAll()[normalized];
  return row ?? null;
}

export function listSavedComparisons(limit = 50): SavedComparisonRecord[] {
  return Object.values(loadAll())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export function saveComparison(
  input: SaveComparisonRequest,
  appOrigin: string,
): { record: SavedComparisonRecord; shareUrl: string } {
  const all = loadAll();
  const now = new Date().toISOString();
  const payload = normalizePayload(input);

  let code = String(input.code ?? "").trim().toLowerCase();
  let createdAt = now;
  if (code && all[code]) {
    createdAt = all[code]!.createdAt;
  } else {
    code = newCode(all);
  }

  const record: SavedComparisonRecord = {
    code,
    createdAt,
    updatedAt: now,
    ...payload,
  };

  all[code] = record;
  persistAll(all);

  const shareUrl = `${appOrigin.replace(/\/$/, "")}/?saved=${encodeURIComponent(code)}`;
  return { record, shareUrl };
}
