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
export const SAVED_COMPARISONS_FILE = path.join(DATA_DIR, "saved-comparisons.json");
export const HPT_DIR = path.join(DATA_DIR, "hpt");
export const HPT_LOCK_FILE = path.join(HPT_DIR, "crawl.lock");
export const HPT_STATUS_FILE = path.join(HPT_DIR, "status.json");
export const HPT_INDEX_CACHE_FILE = path.join(HPT_DIR, "mrf-index.json");
export const HPT_HOSPITALS_DIR = path.join(HPT_DIR, "hospitals");
export const HPT_CODES_DIR = path.join(HPT_DIR, "codes");
export const HPT_TMP_DIR = path.join(HPT_DIR, "tmp");
