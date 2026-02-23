import type {AngleMode} from '../core/evaluator/types';
import {readJson, writeJson} from '../storage/asyncStorageJson';
import type {Folder, HistoryEntry, Settings} from './types';

export const FOLDERS_STORAGE_KEY = 'calc.folders.v1';
export const HISTORY_STORAGE_KEY = 'calc.history.v1';
export const SETTINGS_STORAGE_KEY = 'calc.settings.v1';

const HISTORY_CAP = 5000;
export const RECENTS_CAP = 50;

const DEFAULT_SETTINGS: Settings = {
  angleMode: 'DEG',
};

const createId = (): string =>
  `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const sortByCreatedAtAsc = <T extends {createdAt: number}>(items: T[]): T[] =>
  [...items].sort((left, right) => left.createdAt - right.createdAt);

const sortByCreatedAtDesc = <T extends {createdAt: number}>(items: T[]): T[] =>
  [...items].sort((left, right) => right.createdAt - left.createdAt);

const trimHistory = (entries: HistoryEntry[]): HistoryEntry[] => {
  const sortedEntries = sortByCreatedAtDesc(entries);
  const trimmedRecents: HistoryEntry[] = [];
  let recentsCount = 0;

  for (const entry of sortedEntries) {
    if (entry.folderId === null) {
      if (recentsCount >= RECENTS_CAP) {
        continue;
      }
      recentsCount += 1;
    }

    trimmedRecents.push(entry);
  }

  return trimmedRecents.length > HISTORY_CAP
    ? trimmedRecents.slice(0, HISTORY_CAP)
    : trimmedRecents;
};

const readFolders = async (): Promise<Folder[]> =>
  sortByCreatedAtAsc(await readJson<Folder[]>(FOLDERS_STORAGE_KEY, []));

const writeFolders = async (folders: Folder[]): Promise<void> => {
  await writeJson(FOLDERS_STORAGE_KEY, sortByCreatedAtAsc(folders));
};

const readHistory = async (): Promise<HistoryEntry[]> =>
  sortByCreatedAtDesc(await readJson<HistoryEntry[]>(HISTORY_STORAGE_KEY, []));

const writeHistory = async (entries: HistoryEntry[]): Promise<void> => {
  await writeJson(HISTORY_STORAGE_KEY, trimHistory(entries));
};

export const saveEntry = async (
  expression: string,
  result: string,
): Promise<HistoryEntry> => {
  const entry: HistoryEntry = {
    id: createId(),
    expression,
    result,
    createdAt: Date.now(),
    folderId: null,
  };

  const entries = await readHistory();
  await writeHistory([entry, ...entries]);
  return entry;
};

export const assignEntryToFolder = async (
  entryId: string,
  folderId: string | null,
): Promise<void> => {
  const entries = await readHistory();
  const updatedEntries = entries.map(entry =>
    entry.id === entryId
      ? {
          ...entry,
          folderId,
        }
      : entry,
  );

  await writeHistory(updatedEntries);
};

export const createFolder = async (
  name: string,
  parentId: string | null,
): Promise<Folder> => {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('folder_name_required');
  }

  const folder: Folder = {
    id: createId(),
    name: trimmedName,
    parentId,
    createdAt: Date.now(),
  };

  const folders = await readFolders();
  await writeFolders([...folders, folder]);
  return folder;
};

export const listFoldersTree = async (): Promise<Folder[]> => readFolders();

export const deleteFolderCascade = async (folderId: string): Promise<void> => {
  const folders = await readFolders();
  if (!folders.some(folder => folder.id === folderId)) {
    return;
  }

  const childFolderIdsByParent = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) {
      continue;
    }

    const childIds = childFolderIdsByParent.get(folder.parentId) ?? [];
    childIds.push(folder.id);
    childFolderIdsByParent.set(folder.parentId, childIds);
  }

  const deletedFolderIds = new Set<string>();
  const pendingFolderIds: string[] = [folderId];

  while (pendingFolderIds.length > 0) {
    const currentFolderId = pendingFolderIds.pop();
    if (!currentFolderId || deletedFolderIds.has(currentFolderId)) {
      continue;
    }

    deletedFolderIds.add(currentFolderId);
    const childFolderIds = childFolderIdsByParent.get(currentFolderId) ?? [];
    for (const childFolderId of childFolderIds) {
      pendingFolderIds.push(childFolderId);
    }
  }

  const nextFolders = folders.filter(folder => !deletedFolderIds.has(folder.id));
  const entries = await readHistory();
  const nextEntries = entries.filter(
    entry => !entry.folderId || !deletedFolderIds.has(entry.folderId),
  );

  await Promise.all([writeFolders(nextFolders), writeHistory(nextEntries)]);
};

export const listHistoryEntries = async (): Promise<HistoryEntry[]> =>
  readHistory();

export const clearHistoryEntries = async (): Promise<void> => {
  await writeJson(HISTORY_STORAGE_KEY, []);
};

export const deleteHistoryEntry = async (entryId: string): Promise<void> => {
  const entries = await readHistory();
  await writeHistory(entries.filter(entry => entry.id !== entryId));
};

export const getSettings = async (): Promise<Settings> => {
  const settings = await readJson<Settings>(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS);
  if (settings.angleMode !== 'DEG' && settings.angleMode !== 'RAD') {
    return DEFAULT_SETTINGS;
  }

  return settings;
};

export const setAngleMode = async (angleMode: AngleMode): Promise<void> => {
  await writeJson(SETTINGS_STORAGE_KEY, {angleMode});
};
