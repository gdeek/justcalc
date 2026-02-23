import type {AngleMode} from '../core/evaluator/types';

export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
};

export type HistoryEntry = {
  id: string;
  expression: string;
  result: string;
  createdAt: number;
  folderId: string | null;
};

export type Settings = {
  angleMode: AngleMode;
};
