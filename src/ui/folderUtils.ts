import type {Folder} from '../history/types';

export type FolderOption = {
  id: string;
  name: string;
  depth: number;
};

const byCreatedAt = (left: Folder, right: Folder): number =>
  left.createdAt - right.createdAt;

const collectFolderOptions = (
  folders: Folder[],
  parentId: string | null,
  depth: number,
  target: FolderOption[],
): void => {
  const children = folders
    .filter(folder => folder.parentId === parentId)
    .sort(byCreatedAt);

  for (const folder of children) {
    target.push({
      id: folder.id,
      name: folder.name,
      depth,
    });
    collectFolderOptions(folders, folder.id, depth + 1, target);
  }
};

export const buildFolderOptions = (folders: Folder[]): FolderOption[] => {
  const folderOptions: FolderOption[] = [];
  collectFolderOptions(folders, null, 0, folderOptions);
  return folderOptions;
};

export const getFolderPath = (
  folders: Folder[],
  folderId: string | null,
): string | null => {
  if (!folderId) {
    return null;
  }

  const folderById = new Map(folders.map(folder => [folder.id, folder]));
  const names: string[] = [];
  let cursor = folderById.get(folderId) ?? null;

  while (cursor) {
    names.unshift(cursor.name);
    cursor = cursor.parentId ? folderById.get(cursor.parentId) ?? null : null;
  }

  return names.length > 0 ? names.join(' / ') : null;
};
