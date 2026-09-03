import fs from "fs";
import path from "path";
import zlib from "zlib";
import readline from "readline";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { HPT_TMP_DIR } from "../dataPaths.js";
import { collapseCode, ingestCsvRow, mapCsvHeaderLine, parseCsvLine, type ParsedCodeCharges } from "./parseCsv.js";
import { parseMrfJson, streamParseMrfJsonFile } from "./parseJson.js";

const execFileAsync = promisify(execFile);
const USER_AGENT = "Parigrado/1.0 (hospital price transparency research; https://parigrado.com)";
const MAX_BYTES = 1_500_000_000;
/** Files larger than this use the streaming JSON parser (keeps free-tier RAM in check). */
const JSON_IN_MEMORY_MAX = 25_000_000;

function sniff(buf: Buffer): "zip" | "gzip" | "json" | "csv" {
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return "gzip";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) return "zip";
  const start = buf.toString("utf8", 0, Math.min(buf.length, 32)).trim();
  if (start.startsWith("{") || start.startsWith("[")) return "json";
  return "csv";
}

async function downloadToFile(url: string, dest: string): Promise<number> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
  });
  if (!res.ok) throw new Error(`MRF download ${res.status} ${url}`);
  if (!res.body) throw new Error("Empty MRF body");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const file = fs.createWriteStream(dest);
  const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  let bytes = 0;
  nodeStream.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) {
      nodeStream.destroy(new Error(`MRF exceeds ${MAX_BYTES} bytes`));
    }
  });
  await pipeline(nodeStream, file);
  return bytes;
}

async function parseCsvFile(file: string, acc: Map<string, ParsedCodeCharges>) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let header: ReturnType<typeof mapCsvHeaderLine> = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!header) {
      header = mapCsvHeaderLine(line);
      if (!header) throw new Error("Unrecognized MRF CSV header");
      continue;
    }
    ingestCsvRow(parseCsvLine(line, header.delimiter), header.map, acc);
  }
}

async function unzipToDir(zipPath: string, destDir: string): Promise<string[]> {
  fs.mkdirSync(destDir, { recursive: true });
  await execFileAsync("unzip", ["-o", "-q", zipPath, "-d", destDir]);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(destDir);
  return files;
}

function preferredExtracted(files: string[]): string | null {
  const scored = files
    .filter((f) => /\.(csv|json|gz)$/i.test(f))
    .map((f) => ({ f, n: fs.statSync(f).size }))
    .sort((a, b) => b.n - a.n);
  return scored[0]?.f ?? null;
}

export async function parseMrfUrl(mrfUrl: string): Promise<{
  codes: Record<string, ReturnType<typeof collapseCode>>;
}> {
  fs.mkdirSync(HPT_TMP_DIR, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const rawPath = path.join(HPT_TMP_DIR, `${id}.bin`);
  const acc = new Map<string, ParsedCodeCharges>();

  try {
    await downloadToFile(mrfUrl, rawPath);
    const fd = fs.openSync(rawPath, "r");
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    fs.closeSync(fd);
    let kind = sniff(head);
    let workPath = rawPath;

    if (kind === "gzip") {
      const out = path.join(HPT_TMP_DIR, `${id}.ungz`);
      await pipeline(fs.createReadStream(rawPath), zlib.createGunzip(), fs.createWriteStream(out));
      workPath = out;
      const h2 = Buffer.alloc(8);
      const fd2 = fs.openSync(workPath, "r");
      fs.readSync(fd2, h2, 0, 8, 0);
      fs.closeSync(fd2);
      kind = sniff(h2);
    }

    if (kind === "zip") {
      const dir = path.join(HPT_TMP_DIR, `${id}-zip`);
      const files = await unzipToDir(workPath, dir);
      const inner = preferredExtracted(files);
      if (!inner) throw new Error("ZIP contained no CSV/JSON MRF");
      workPath = inner;
      const h2 = Buffer.alloc(8);
      const fd2 = fs.openSync(workPath, "r");
      fs.readSync(fd2, h2, 0, 8, 0);
      fs.closeSync(fd2);
      kind = sniff(h2);
      if (kind === "gzip") {
        const out = path.join(HPT_TMP_DIR, `${id}.inner.ungz`);
        await pipeline(fs.createReadStream(workPath), zlib.createGunzip(), fs.createWriteStream(out));
        workPath = out;
        const h3 = Buffer.alloc(8);
        const fd3 = fs.openSync(workPath, "r");
        fs.readSync(fd3, h3, 0, 8, 0);
        fs.closeSync(fd3);
        kind = sniff(h3);
      }
    }

    if (kind === "json") {
      const size = fs.statSync(workPath).size;
      if (size > JSON_IN_MEMORY_MAX) {
        const items = await streamParseMrfJsonFile(workPath, acc);
        if (items === 0 && acc.size === 0) {
          throw new Error(`Streaming JSON parse found 0 charge items (${Math.round(size / 1e6)}MB)`);
        }
      } else {
        parseMrfJson(fs.readFileSync(workPath, "utf8"), acc);
      }
    } else {
      await parseCsvFile(workPath, acc);
    }

    const codes: Record<string, ReturnType<typeof collapseCode>> = {};
    for (const [code, row] of acc) {
      if (row.cash.length === 0 && row.negotiated.length === 0) continue;
      codes[code] = collapseCode(row);
    }
    return { codes };
  } finally {
    try {
      for (const name of fs.readdirSync(HPT_TMP_DIR)) {
        if (name.startsWith(id)) {
          const p = path.join(HPT_TMP_DIR, name);
          fs.rmSync(p, { recursive: true, force: true });
        }
      }
    } catch {
      /* ignore */
    }
  }
}

