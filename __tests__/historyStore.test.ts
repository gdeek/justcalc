import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  FOLDERS_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  RECENTS_CAP,
  assignEntryToFolder,
  createFolder,
  deleteFolderCascade,
  getSettings,
  listFoldersTree,
  listHistoryEntries,
  saveEntry,
  setAngleMode,
} from '../src/history/historyStore';

describe('historyStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('saves entries to history', async () => {
    const entry = await saveEntry('2+3', '5');
    const entries = await listHistoryEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(entry.id);
    expect(entries[0].expression).toBe('2+3');
    expect(entries[0].result).toBe('5');
    expect(entries[0].folderId).toBeNull();
  });

  test('assigns an entry to a folder', async () => {
    const folder = await createFolder('Car 2026', null);
    const entry = await saveEntry('50000-7000', '43000');

    await assignEntryToFolder(entry.id, folder.id);

    const entries = await listHistoryEntries();
    expect(entries[0].folderId).toBe(folder.id);
  });

  test('creates nested folders', async () => {
    const parent = await createFolder('Car 2026', null);
    const child = await createFolder('Lease', parent.id);
    await createFolder('Subaru Forester Hybrid 2025', child.id);

    const folders = await listFoldersTree();
    expect(folders).toHaveLength(3);
    expect(folders.find(folder => folder.id === child.id)?.parentId).toBe(
      parent.id,
    );
  });

  test('deletes a folder cascade with nested folders and entries', async () => {
    const root = await createFolder('Car 2026', null);
    const lease = await createFolder('Lease', root.id);
    const vehicle = await createFolder('Subaru Forester Hybrid 2025', lease.id);
    const keepFolder = await createFolder('Keep', null);

    const rootEntry = await saveEntry('50000-7000', '43000');
    await assignEntryToFolder(rootEntry.id, root.id);

    const leaseEntry = await saveEntry('30000/36', '833.333333');
    await assignEntryToFolder(leaseEntry.id, lease.id);

    const vehicleEntry = await saveEntry('32000*0.07', '2240');
    await assignEntryToFolder(vehicleEntry.id, vehicle.id);

    const keepEntry = await saveEntry('8*8', '64');
    await assignEntryToFolder(keepEntry.id, keepFolder.id);

    const recentsEntry = await saveEntry('1+1', '2');

    await deleteFolderCascade(root.id);

    const folders = await listFoldersTree();
    expect(folders).toHaveLength(1);
    expect(folders[0].id).toBe(keepFolder.id);

    const entries = await listHistoryEntries();
    expect(entries.some(entry => entry.id === rootEntry.id)).toBe(false);
    expect(entries.some(entry => entry.id === leaseEntry.id)).toBe(false);
    expect(entries.some(entry => entry.id === vehicleEntry.id)).toBe(false);
    expect(entries.some(entry => entry.id === keepEntry.id)).toBe(true);
    expect(entries.some(entry => entry.id === recentsEntry.id)).toBe(true);
  });

  test('keeps recents capped to 50 entries', async () => {
    const now = Date.now();
    const seededEntries = Array.from({length: RECENTS_CAP}, (_, index) => ({
      id: `seed-${index}`,
      expression: `${index}+1`,
      result: `${index + 1}`,
      createdAt: now - index,
      folderId: null,
    }));

    await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(seededEntries));
    await saveEntry('1+1', '2');

    const entries = await listHistoryEntries();
    const recentEntries = entries.filter(entry => entry.folderId === null);
    expect(recentEntries).toHaveLength(RECENTS_CAP);
    expect(entries.some(entry => entry.expression === '1+1')).toBe(true);
    expect(entries.some(entry => entry.id === `seed-${RECENTS_CAP - 1}`)).toBe(
      false,
    );
  });

  test('does not prune moved entries when recents exceed 50', async () => {
    const folder = await createFolder('Car 2026', null);
    const oldMovedEntry = {
      id: 'moved-1',
      expression: '100-40',
      result: '60',
      createdAt: Date.now() - 100000,
      folderId: folder.id,
    };
    const recents = Array.from({length: RECENTS_CAP}, (_, index) => ({
      id: `recent-${index}`,
      expression: `${index}+2`,
      result: `${index + 2}`,
      createdAt: Date.now() - index,
      folderId: null,
    }));

    await AsyncStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([oldMovedEntry, ...recents]),
    );
    await saveEntry('2+2', '4');

    const entries = await listHistoryEntries();
    expect(entries.some(entry => entry.id === oldMovedEntry.id)).toBe(true);
  });

  test('stores and loads angle mode settings', async () => {
    expect((await getSettings()).angleMode).toBe('DEG');

    await setAngleMode('RAD');
    expect((await getSettings()).angleMode).toBe('RAD');
  });

  test('reads folders from storage key', async () => {
    await AsyncStorage.setItem(
      FOLDERS_STORAGE_KEY,
      JSON.stringify([
        {
          id: '1',
          name: 'Finance',
          parentId: null,
          createdAt: 1,
        },
      ]),
    );

    const folders = await listFoldersTree();
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Finance');
  });
});
