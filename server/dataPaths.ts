import path from "path";

/** Project-root data/ (Render disk mounts at /opt/render/project/src/data). */
export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

// Local dev uses ./data/; existing .cache/archives is not migrated automatically.
export const ARCHIVE_DIR = path.join(DATA_DIR, "archives");
export const ARCHIVE_RAW_DIR = path.join(DATA_DIR, "archives-raw");
export const ARCHIVE_EXTRACT_DIR = path.join(DATA_DIR, "archives-extracted");
export const ARCHIVE_LOCK_FILE = path.join(DATA_DIR, "archive-ingest.lock");
export const PARTNERS_FILE = path.join(DATA_DIR, "partners.json");
export const LOGOS_DIR = path.join(DATA_DIR, "partner-logos");
export const HOSPITALS_CACHE_FILE = path.join(DATA_DIR, "hospitals.json");
export const SCORES_CACHE_FILE = path.join(DATA_DIR, "hcahps-scores.json");
