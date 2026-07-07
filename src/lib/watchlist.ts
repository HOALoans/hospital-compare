const STORAGE_KEY = "parigrado-watchlist";

export interface WatchlistEntry {
  facilityId: string;
  name: string;
  addedAt: string;
}

export function getWatchlist(): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isOnWatchlist(facilityId: string): boolean {
  return getWatchlist().some((e) => e.facilityId === facilityId);
}

export function addToWatchlist(entry: Omit<WatchlistEntry, "addedAt">): WatchlistEntry[] {
  const list = getWatchlist().filter((e) => e.facilityId !== entry.facilityId);
  const next = [{ ...entry, addedAt: new Date().toISOString() }, ...list];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeFromWatchlist(facilityId: string): WatchlistEntry[] {
  const next = getWatchlist().filter((e) => e.facilityId !== facilityId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
