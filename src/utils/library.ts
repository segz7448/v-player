import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ResolvedSource } from './linkResolver';

export interface LibraryEntry {
  id: string; // uri used as unique key
  uri: string;
  type: ResolvedSource['type'];
  title: string; // derived label (filename or host), user-editable later
  addedAt: number; // epoch ms
  lastPlayedAt?: number;
  lastPositionSec?: number;
}

const FAVORITES_KEY = '@video_player/favorites';
const HISTORY_KEY = '@video_player/history';
const MAX_HISTORY_ENTRIES = 50;

function deriveTitle(uri: string): string {
  try {
    const clean = uri.split('?')[0].split('#')[0];
    const parts = clean.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return decodeURIComponent(last);
    const hostMatch = uri.match(/^https?:\/\/([^/]+)/i);
    return hostMatch ? hostMatch[1] : uri;
  } catch {
    return uri;
  }
}

async function readList(key: string): Promise<LibraryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeList(key: string, list: LibraryEntry[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(list));
}

// ---------- Favorites ----------

export async function getFavorites(): Promise<LibraryEntry[]> {
  const list = await readList(FAVORITES_KEY);
  return list.sort((a, b) => b.addedAt - a.addedAt);
}

export async function isFavorite(uri: string): Promise<boolean> {
  const list = await readList(FAVORITES_KEY);
  return list.some((e) => e.id === uri);
}

export async function addFavorite(source: ResolvedSource): Promise<LibraryEntry[]> {
  const list = await readList(FAVORITES_KEY);
  if (list.some((e) => e.id === source.uri)) return list;
  const entry: LibraryEntry = {
    id: source.uri,
    uri: source.uri,
    type: source.type,
    title: deriveTitle(source.uri),
    addedAt: Date.now(),
  };
  const updated = [entry, ...list];
  await writeList(FAVORITES_KEY, updated);
  return updated;
}

export async function removeFavorite(uri: string): Promise<LibraryEntry[]> {
  const list = await readList(FAVORITES_KEY);
  const updated = list.filter((e) => e.id !== uri);
  await writeList(FAVORITES_KEY, updated);
  return updated;
}

export async function toggleFavorite(source: ResolvedSource): Promise<{ list: LibraryEntry[]; isFav: boolean }> {
  const already = await isFavorite(source.uri);
  if (already) {
    const list = await removeFavorite(source.uri);
    return { list, isFav: false };
  }
  const list = await addFavorite(source);
  return { list, isFav: true };
}

// ---------- History ----------

export async function getHistory(): Promise<LibraryEntry[]> {
  const list = await readList(HISTORY_KEY);
  return list.sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
}

export async function recordPlayed(
  source: ResolvedSource,
  positionSec?: number
): Promise<LibraryEntry[]> {
  const list = await readList(HISTORY_KEY);
  const existingIdx = list.findIndex((e) => e.id === source.uri);
  const now = Date.now();

  if (existingIdx >= 0) {
    list[existingIdx] = {
      ...list[existingIdx],
      lastPlayedAt: now,
      lastPositionSec: positionSec ?? list[existingIdx].lastPositionSec,
    };
  } else {
    list.unshift({
      id: source.uri,
      uri: source.uri,
      type: source.type,
      title: deriveTitle(source.uri),
      addedAt: now,
      lastPlayedAt: now,
      lastPositionSec: positionSec,
    });
  }

  const trimmed = list
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, MAX_HISTORY_ENTRIES);

  await writeList(HISTORY_KEY, trimmed);
  return trimmed;
}

export async function updatePlaybackPosition(uri: string, positionSec: number): Promise<void> {
  const list = await readList(HISTORY_KEY);
  const idx = list.findIndex((e) => e.id === uri);
  if (idx >= 0) {
    list[idx].lastPositionSec = positionSec;
    await writeList(HISTORY_KEY, list);
  }
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

export async function removeHistoryEntry(uri: string): Promise<LibraryEntry[]> {
  const list = await readList(HISTORY_KEY);
  const updated = list.filter((e) => e.id !== uri);
  await writeList(HISTORY_KEY, updated);
  return updated;
}
