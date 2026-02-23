import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type {
  GestureResponderEvent,
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
  TextStyle,
} from 'react-native';

import {
  balanceExpressionForEvaluation,
  evaluateExpression,
} from './src/core/evaluator/evaluateExpression';
import type {AngleMode} from './src/core/evaluator/types';
import {canEvaluateExpression, getUnclosedParenthesesCount, insertToken} from './src/core/parser/insertToken';
import {
  assignEntryToFolder,
  createFolder,
  deleteFolderCascade,
  deleteHistoryEntry,
  getSettings,
  listFoldersTree,
  listHistoryEntries,
  saveEntry,
  setAngleMode as persistAngleMode,
} from './src/history/historyStore';
import type {Folder, HistoryEntry} from './src/history/types';
import {buildFolderOptions, getFolderPath} from './src/ui/folderUtils';

type ButtonSpec = {
  label: string;
  token?: string;
  action?: () => void;
  textStyle?: TextStyle;
  disabled?: boolean;
};

type CursorSelection = {
  start: number;
  end: number;
};

type TokenInsertResult = {
  nextExpression: string;
  nextSelection: CursorSelection;
};

type HistoryTreeItem = {
  id: string;
  depth: number;
  type: 'folder' | 'entry';
  label: string;
  entry?: HistoryEntry;
  canMove?: boolean;
};

const CONTINUE_FROM_RESULT_TOKENS = new Set([
  '+',
  '-',
  '×',
  '÷',
  '%',
  '^',
  'POW',
  'POW2',
  'POW3',
  'INV',
  'FACTORIAL',
  ')',
  'BACKSPACE',
]);

const EXPRESSION_DRAG_THRESHOLD_PX = 4;
const RESULT_MAX_DECIMALS = 4;
const CLOSE_PAREN_BLOCKED_CHARS = new Set(['+', '-', '×', '÷', '%', '^', '(']);

const SCIENTIFIC_LAYOUT: Array<Array<{label: string; token?: string} | null>> = [
  [
    {label: 'sin', token: 'FUNC:sin'},
    {label: 'cos', token: 'FUNC:cos'},
    {label: 'tan', token: 'FUNC:tan'},
    {label: 'sin⁻¹', token: 'FUNC:asin'},
  ],
  [
    {label: 'cos⁻¹', token: 'FUNC:acos'},
    {label: 'tan⁻¹', token: 'FUNC:atan'},
    {label: 'sinh', token: 'FUNC:sinh'},
    null,
  ],
  [
    {label: 'tanh', token: 'FUNC:tanh'},
    {label: 'sinh⁻¹', token: 'FUNC:asinh'},
    {label: 'cosh⁻¹', token: 'FUNC:acosh'},
    null,
  ],
  [
    {label: 'π', token: 'CONST:PI'},
    {label: 'e', token: 'CONST:E'},
    {label: 'xⁿ', token: 'POW'},
    {label: 'x²', token: 'POW2'},
  ],
  [
    {label: 'x³', token: 'POW3'},
    {label: 'x⁻¹', token: 'INV'},
    {label: 'lg', token: 'FUNC:log10'},
    {label: 'ln', token: 'FUNC:ln'},
  ],
  [
    {label: 'log₂', token: 'FUNC:log2'},
    {label: 'x!', token: 'FACTORIAL'},
    {label: '√x', token: 'FUNC:sqrt'},
    {label: '³√x', token: 'FUNC:cbrt'},
  ],
];

const TOKEN_LITERAL_MAP: Record<string, string> = {
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '.': '.',
  '+': '+',
  '-': '-',
  '×': '×',
  '÷': '÷',
  '%': '%',
  '(': '(',
  ')': ')',
  POW: '^',
  POW2: '^2',
  POW3: '^3',
  INV: '^-1',
  FACTORIAL: '!',
  'CONST:PI': 'π',
  'CONST:E': 'e',
  'FUNC:sin': 'sin(',
  'FUNC:cos': 'cos(',
  'FUNC:tan': 'tan(',
  'FUNC:asin': 'asin(',
  'FUNC:acos': 'acos(',
  'FUNC:atan': 'atan(',
  'FUNC:sinh': 'sinh(',
  'FUNC:tanh': 'tanh(',
  'FUNC:asinh': 'asinh(',
  'FUNC:acosh': 'acosh(',
  'FUNC:log10': 'log10(',
  'FUNC:ln': 'ln(',
  'FUNC:log2': 'log2(',
  'FUNC:sqrt': 'sqrt(',
  'FUNC:cbrt': 'cbrt(',
};

const clampSelection = (
  value: CursorSelection,
  expression: string,
): CursorSelection => {
  const boundedStart = Math.max(0, Math.min(value.start, expression.length));
  const boundedEnd = Math.max(0, Math.min(value.end, expression.length));

  return {
    start: Math.min(boundedStart, boundedEnd),
    end: Math.max(boundedStart, boundedEnd),
  };
};

const formatResultForRow = (value: string): string => {
  const numericValue = Number.parseFloat(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }

  const rounded = Number.parseFloat(numericValue.toFixed(RESULT_MAX_DECIMALS));
  return rounded.toString();
};

const applyTokenAtSelection = (
  expression: string,
  token: string,
  selection: CursorSelection,
): TokenInsertResult => {
  const boundedSelection = clampSelection(selection, expression);
  const start = boundedSelection.start;
  const end = boundedSelection.end;

  if (token === 'CLEAR') {
    return {
      nextExpression: '',
      nextSelection: {start: 0, end: 0},
    };
  }

  if (token === 'BACKSPACE') {
    if (start !== end) {
      const nextExpression = `${expression.slice(0, start)}${expression.slice(end)}`;
      return {
        nextExpression,
        nextSelection: {start, end: start},
      };
    }

    if (start === 0) {
      return {
        nextExpression: expression,
        nextSelection: boundedSelection,
      };
    }

    const nextCursor = start - 1;
    const nextExpression =
      expression.slice(0, nextCursor) + expression.slice(start);

    return {
      nextExpression,
      nextSelection: {start: nextCursor, end: nextCursor},
    };
  }

  if (token === 'NEGATE') {
    if (start !== end) {
      const selectedText = expression.slice(start, end);
      const inserted = `(-${selectedText})`;
      const nextExpression =
        expression.slice(0, start) + inserted + expression.slice(end);
      const cursor = start + inserted.length;

      return {
        nextExpression,
        nextSelection: {start: cursor, end: cursor},
      };
    }

    if (start === expression.length) {
      const nextExpression = insertToken(expression, token);
      const cursor = nextExpression.length;
      return {
        nextExpression,
        nextSelection: {start: cursor, end: cursor},
      };
    }

    const nextExpression =
      expression.slice(0, start) + '-' + expression.slice(end);
    const cursor = start + 1;

    return {
      nextExpression,
      nextSelection: {start: cursor, end: cursor},
    };
  }

  if (token === ')' && start === end && start < expression.length) {
    const beforeCursor = expression.slice(0, start);
    const afterCursor = expression.slice(start);

    if (beforeCursor.length === 0) {
      return {
        nextExpression: expression,
        nextSelection: boundedSelection,
      };
    }

    const lastCharBeforeCursor = beforeCursor[beforeCursor.length - 1];
    if (CLOSE_PAREN_BLOCKED_CHARS.has(lastCharBeforeCursor)) {
      return {
        nextExpression: expression,
        nextSelection: boundedSelection,
      };
    }

    const unclosedBeforeCursor = getUnclosedParenthesesCount(beforeCursor);
    if (unclosedBeforeCursor > 0) {
      const nextExpression = beforeCursor + ')' + afterCursor;
      const cursor = start + 1;
      return {
        nextExpression,
        nextSelection: {start: cursor, end: cursor},
      };
    }

    const nextExpression = '(' + beforeCursor + ')' + afterCursor;
    const cursor = start + 2;
    return {
      nextExpression,
      nextSelection: {start: cursor, end: cursor},
    };
  }

  if (start === expression.length && end === expression.length) {
    const nextExpression = insertToken(expression, token);
    const cursor = nextExpression.length;
    return {
      nextExpression,
      nextSelection: {start: cursor, end: cursor},
    };
  }

  const literal = TOKEN_LITERAL_MAP[token];
  if (!literal) {
    return {
      nextExpression: expression,
      nextSelection: boundedSelection,
    };
  }

  const nextExpression =
    expression.slice(0, start) + literal + expression.slice(end);
  const cursor = start + literal.length;

  return {
    nextExpression,
    nextSelection: {start: cursor, end: cursor},
  };
};

const App = (): React.JSX.Element => {
  const {height: windowHeight} = useWindowDimensions();
  const [keypadPageHeight, setKeypadPageHeight] = useState(
    Math.max(300, Math.floor(windowHeight * 0.6)),
  );

  const [expression, setExpression] = useState('');
  const [inputSelection, setInputSelection] = useState<CursorSelection>({
    start: 0,
    end: 0,
  });
  const [committedResult, setCommittedResult] = useState<string | null>(null);
  const [equalsCommitted, setEqualsCommitted] = useState(false);

  const [angleMode, setAngleMode] = useState<AngleMode>('DEG');
  const [activeKeypadPage, setActiveKeypadPage] = useState(0);

  const [menuVisible, setMenuVisible] = useState(false);
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [entryPendingMove, setEntryPendingMove] = useState<HistoryEntry | null>(
    null,
  );
  const [folderNameDraft, setFolderNameDraft] = useState('');
  const [bannerEntry, setBannerEntry] = useState<HistoryEntry | null>(null);
  const [isExpressionCursorVisible, setIsExpressionCursorVisible] =
    useState(false);
  const [folderDeleteCandidate, setFolderDeleteCandidate] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const pagerRef = useRef<ScrollView | null>(null);
  const topDisplayRef = useRef<ScrollView | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expressionInputRef = useRef<TextInput | null>(null);
  const expressionRef = useRef('');
  const expressionDragStartXRef = useRef<number | null>(null);
  const expressionDraggingRef = useRef(false);
  const expressionCursorVisibleRef = useRef(false);
  const pendingTapSelectionRef = useRef<CursorSelection | null>(null);
  const ignoreSelectionChangeRef = useRef(false);
  const inputSelectionRef = useRef<CursorSelection>({start: 0, end: 0});

  const historyPressStartXRef = useRef<Record<string, number>>({});
  const folderPressStartXRef = useRef<Record<string, number>>({});

  const folderOptions = useMemo(() => buildFolderOptions(folders), [folders]);

  const clearBannerTimer = useCallback((): void => {
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = null;
    }
  }, []);

  const scheduleBannerDismiss = useCallback((): void => {
    clearBannerTimer();
    bannerTimeoutRef.current = setTimeout(() => {
      setBannerEntry(null);
      bannerTimeoutRef.current = null;
    }, 3500);
  }, [clearBannerTimer]);

  const refreshHistoryData = useCallback(async () => {
    const [loadedFolders, loadedEntries] = await Promise.all([
      listFoldersTree(),
      listHistoryEntries(),
    ]);

    setFolders(loadedFolders);
    setHistoryEntries(loadedEntries);
  }, []);

  const refreshAllData = useCallback(async () => {
    const [loadedFolders, loadedEntries, settings] = await Promise.all([
      listFoldersTree(),
      listHistoryEntries(),
      getSettings(),
    ]);

    setFolders(loadedFolders);
    setHistoryEntries(loadedEntries);
    setAngleMode(settings.angleMode);
  }, []);

  useEffect(() => {
    refreshAllData().catch(() => {});
    return () => {
      clearBannerTimer();
    };
  }, [clearBannerTimer, refreshAllData]);

  useEffect(() => {
    expressionRef.current = expression;
  }, [expression]);

  useEffect(() => {
    inputSelectionRef.current = inputSelection;
  }, [inputSelection]);

  const setExpressionCursorVisibility = useCallback((visible: boolean): void => {
    expressionCursorVisibleRef.current = visible;
    setIsExpressionCursorVisible(visible);
  }, []);

  const runningValue = useMemo(() => {
    if (expression.trim().length === 0) {
      return '';
    }

    let candidate = expression;
    while (candidate.length > 0 && !canEvaluateExpression(candidate)) {
      candidate = candidate.slice(0, -1);
    }

    if (candidate.length === 0) {
      return '';
    }

    const evaluated = evaluateExpression(
      balanceExpressionForEvaluation(candidate),
      angleMode,
    );

    return evaluated.error ? '' : evaluated.value;
  }, [angleMode, expression]);

  const topDisplayValue = committedResult
    ? `= ${formatResultForRow(committedResult)}`
    : formatResultForRow(runningValue);

  useEffect(() => {
    requestAnimationFrame(() => {
      topDisplayRef.current?.scrollToEnd({animated: false});
    });
  }, [topDisplayValue]);

  const historyTreeItems = useMemo(() => {
    const items: HistoryTreeItem[] = [];
    const folderChildrenMap = new Map<string | null, Folder[]>();
    const entriesByFolderMap = new Map<string | null, HistoryEntry[]>();

    for (const folder of folders) {
      const siblingFolders = folderChildrenMap.get(folder.parentId) ?? [];
      siblingFolders.push(folder);
      folderChildrenMap.set(folder.parentId, siblingFolders);
    }

    for (const siblingFolders of folderChildrenMap.values()) {
      siblingFolders.sort((left, right) => left.createdAt - right.createdAt);
    }

    for (const entry of historyEntries) {
      const groupedEntries = entriesByFolderMap.get(entry.folderId) ?? [];
      groupedEntries.push(entry);
      entriesByFolderMap.set(entry.folderId, groupedEntries);
    }

    for (const groupedEntries of entriesByFolderMap.values()) {
      groupedEntries.sort((left, right) => right.createdAt - left.createdAt);
    }

    const recents = entriesByFolderMap.get(null) ?? [];
    items.push({
      id: 'folder-recents',
      depth: 0,
      type: 'folder',
      label: `Recents (${recents.length})`,
    });

    for (const entry of recents) {
      items.push({
        id: `recent-${entry.id}`,
        depth: 1,
        type: 'entry',
        label: `${entry.expression} = ${entry.result}`,
        entry,
        canMove: true,
      });
    }

    const walkFolders = (parentId: string | null, depth: number): void => {
      const childFolders = folderChildrenMap.get(parentId) ?? [];

      for (const folder of childFolders) {
        items.push({
          id: `folder-${folder.id}`,
          depth,
          type: 'folder',
          label: folder.name,
        });

        const folderEntries = entriesByFolderMap.get(folder.id) ?? [];
        for (const entry of folderEntries) {
          items.push({
            id: `entry-${entry.id}`,
            depth: depth + 1,
            type: 'entry',
            label: `${entry.expression} = ${entry.result}`,
            entry,
          });
        }

        walkFolders(folder.id, depth + 1);
      }
    };

    walkFolders(null, 0);

    return items;
  }, [folders, historyEntries]);

  const openMenu = useCallback(() => {
    refreshHistoryData().catch(() => {});
    setMenuVisible(true);
  }, [refreshHistoryData]);

  const openMovePicker = useCallback((entry: HistoryEntry) => {
    setEntryPendingMove(entry);
    setSelectedFolderId(entry.folderId ?? null);
    setFolderPickerVisible(true);
  }, []);

  const openFolderManager = useCallback(() => {
    setEntryPendingMove(null);
    setSelectedFolderId(null);
    setFolderNameDraft('');
    setFolderPickerVisible(true);
  }, []);

  const syncNativeSelection = useCallback((nextSelection: CursorSelection) => {
    ignoreSelectionChangeRef.current = true;
    requestAnimationFrame(() => {
      expressionInputRef.current?.setNativeProps({
        selection: nextSelection,
      });
      ignoreSelectionChangeRef.current = false;
    });
  }, []);

  const setSelectionIfChanged = useCallback(
    (nextSelection: CursorSelection): boolean => {
      const currentSelection = inputSelectionRef.current;
      if (
        currentSelection.start === nextSelection.start &&
        currentSelection.end === nextSelection.end
      ) {
        return false;
      }

      inputSelectionRef.current = nextSelection;
      setInputSelection(nextSelection);
      return true;
    },
    [],
  );

  const onExpressionSelectionChange = useCallback(
    (
      event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
    ): void => {
      if (expressionDraggingRef.current || ignoreSelectionChangeRef.current) {
        return;
      }

      const nextSelection = clampSelection(
        event.nativeEvent.selection as CursorSelection,
        expression,
      );

      if (!expressionCursorVisibleRef.current) {
        pendingTapSelectionRef.current = nextSelection;
        return;
      }

      setSelectionIfChanged(nextSelection);
    },
    [expression, setSelectionIfChanged],
  );

  const onExpressionFocus = useCallback((): void => {
    if (!expressionCursorVisibleRef.current) {
      expressionInputRef.current?.blur();
    }
  }, []);

  const onExpressionTouchStart = useCallback(
    (event: GestureResponderEvent): void => {
      expressionDragStartXRef.current = event.nativeEvent.pageX;
      expressionDraggingRef.current = false;
      pendingTapSelectionRef.current = null;
    },
    [],
  );

  const onExpressionTouchMove = useCallback(
    (event: GestureResponderEvent): void => {
      const startX = expressionDragStartXRef.current;
      if (startX === null) {
        return;
      }

      const deltaX = event.nativeEvent.pageX - startX;
      if (
        !expressionDraggingRef.current &&
        Math.abs(deltaX) < EXPRESSION_DRAG_THRESHOLD_PX
      ) {
        return;
      }

      if (!expressionDraggingRef.current) {
        expressionDraggingRef.current = true;
        pendingTapSelectionRef.current = null;
        if (expressionCursorVisibleRef.current) {
          setExpressionCursorVisibility(false);
        }
      }
    },
    [setExpressionCursorVisibility],
  );

  const onExpressionTouchEnd = useCallback((): void => {
    const didDrag = expressionDraggingRef.current;
    expressionDragStartXRef.current = null;
    expressionDraggingRef.current = false;

    if (didDrag) {
      pendingTapSelectionRef.current = null;
      expressionInputRef.current?.blur();
      return;
    }

    const pendingSelection = pendingTapSelectionRef.current;
    pendingTapSelectionRef.current = null;

    if (pendingSelection) {
      setSelectionIfChanged(pendingSelection);
    }

    if (!expressionCursorVisibleRef.current) {
      setExpressionCursorVisibility(true);
      expressionInputRef.current?.focus();
    }

    if (pendingSelection) {
      syncNativeSelection(pendingSelection);
    }
  }, [setExpressionCursorVisibility, setSelectionIfChanged, syncNativeSelection]);

  const applyExpressionUpdate = useCallback(
    (nextExpression: string, nextSelection: CursorSelection) => {
      expressionRef.current = nextExpression;
      setExpression(nextExpression);
      setSelectionIfChanged(nextSelection);
      setCommittedResult(null);
      setEqualsCommitted(false);
      syncNativeSelection(nextSelection);
    },
    [setSelectionIfChanged, syncNativeSelection],
  );

  const onTokenPress = useCallback(
    (token: string) => {
      if (!expressionCursorVisibleRef.current) {
        setExpressionCursorVisibility(true);
      }
      expressionInputRef.current?.focus();

      let baseExpression = expressionRef.current;
      let baseSelection = inputSelectionRef.current;

      const cursorAtExpressionEnd =
        baseSelection.start === baseExpression.length &&
        baseSelection.end === baseExpression.length;

      if (
        equalsCommitted &&
        cursorAtExpressionEnd &&
        !CONTINUE_FROM_RESULT_TOKENS.has(token)
      ) {
        baseExpression = '';
        baseSelection = {start: 0, end: 0};
      }

      const resultAfterInsert = applyTokenAtSelection(
        baseExpression,
        token,
        baseSelection,
      );

      applyExpressionUpdate(
        resultAfterInsert.nextExpression,
        resultAfterInsert.nextSelection,
      );
    },
    [applyExpressionUpdate, equalsCommitted, setExpressionCursorVisibility],
  );

  const onEqualsPress = useCallback(async () => {
    if (!canEvaluateExpression(expression)) {
      return;
    }

    const balancedExpression = balanceExpressionForEvaluation(expression);
    const evaluated = evaluateExpression(balancedExpression, angleMode);

    if (evaluated.error) {
      setCommittedResult('Error');
      setEqualsCommitted(false);
      return;
    }

    const cursor = balancedExpression.length;
    expressionRef.current = balancedExpression;
    setExpression(balancedExpression);
    const nextSelection = {start: cursor, end: cursor};
    setSelectionIfChanged(nextSelection);
    setCommittedResult(evaluated.value);
    setEqualsCommitted(true);
    syncNativeSelection(nextSelection);

    const savedEntry = await saveEntry(balancedExpression, evaluated.value);
    const updatedEntries = await listHistoryEntries();
    setHistoryEntries(updatedEntries);
    setBannerEntry(savedEntry);
    scheduleBannerDismiss();
  }, [
    angleMode,
    expression,
    scheduleBannerDismiss,
    setSelectionIfChanged,
    syncNativeSelection,
  ]);

  const loadHistoryEntryIntoMain = useCallback((entry: HistoryEntry) => {
    expressionRef.current = entry.expression;
    setExpression(entry.expression);
    const cursor = entry.expression.length;
    const nextSelection = {start: cursor, end: cursor};
    setSelectionIfChanged(nextSelection);
    setCommittedResult(entry.result);
    setEqualsCommitted(false);
    setMenuVisible(false);
    pagerRef.current?.scrollTo({y: 0, animated: true});
    setActiveKeypadPage(0);
    requestAnimationFrame(() => {
      expressionInputRef.current?.focus();
      expressionInputRef.current?.setNativeProps({selection: nextSelection});
    });
  }, [setSelectionIfChanged]);

  const removeHistoryEntry = useCallback(async (entryId: string) => {
    await deleteHistoryEntry(entryId);
    const updatedEntries = await listHistoryEntries();
    setHistoryEntries(updatedEntries);
    setBannerEntry(previous => (previous?.id === entryId ? null : previous));
  }, []);

  const onHistoryEntryPressIn = useCallback(
    (entryId: string, event: GestureResponderEvent) => {
      historyPressStartXRef.current[entryId] = event.nativeEvent.pageX;
    },
    [],
  );

  const onHistoryEntryPressOut = useCallback(
    (entry: HistoryEntry, event: GestureResponderEvent) => {
      const startX = historyPressStartXRef.current[entry.id];
      delete historyPressStartXRef.current[entry.id];

      if (startX === undefined) {
        return;
      }

      const deltaX = startX - event.nativeEvent.pageX;
      if (deltaX >= 44) {
        removeHistoryEntry(entry.id).catch(() => {});
        return;
      }

      loadHistoryEntryIntoMain(entry);
    },
    [loadHistoryEntryIntoMain, removeHistoryEntry],
  );

  const moveEntryToFolder = useCallback(
    async (entry: HistoryEntry, folderId: string | null) => {
      await assignEntryToFolder(entry.id, folderId);
      const updatedEntries = await listHistoryEntries();
      setHistoryEntries(updatedEntries);
      setBannerEntry(previous =>
        previous && previous.id === entry.id
          ? {
              ...previous,
              folderId,
            }
          : previous,
      );
      setFolderPickerVisible(false);
      setEntryPendingMove(null);
      setSelectedFolderId(folderId);
    },
    [],
  );

  const onFolderPressIn = useCallback(
    (folderId: string, event: GestureResponderEvent) => {
      folderPressStartXRef.current[folderId] = event.nativeEvent.pageX;
    },
    [],
  );

  const onFolderPressOut = useCallback(
    (
      option: {
        id: string;
        name: string;
      },
      event: GestureResponderEvent,
    ) => {
      const startX = folderPressStartXRef.current[option.id];
      delete folderPressStartXRef.current[option.id];

      if (startX !== undefined && !entryPendingMove) {
        const deltaX = startX - event.nativeEvent.pageX;
        if (deltaX >= 44) {
          setFolderDeleteCandidate(option);
          return;
        }
      }

      if (entryPendingMove) {
        moveEntryToFolder(entryPendingMove, option.id).catch(() => {});
        return;
      }

      setSelectedFolderId(option.id);
    },
    [entryPendingMove, moveEntryToFolder],
  );

  const deleteFolderWithChildren = useCallback(async () => {
    if (!folderDeleteCandidate) {
      return;
    }

    const childIdsByParent = new Map<string, string[]>();
    for (const folder of folders) {
      if (!folder.parentId) {
        continue;
      }

      const childIds = childIdsByParent.get(folder.parentId) ?? [];
      childIds.push(folder.id);
      childIdsByParent.set(folder.parentId, childIds);
    }

    const deletedFolderIds = new Set<string>();
    const pendingFolderIds: string[] = [folderDeleteCandidate.id];

    while (pendingFolderIds.length > 0) {
      const pendingFolderId = pendingFolderIds.pop();
      if (!pendingFolderId || deletedFolderIds.has(pendingFolderId)) {
        continue;
      }

      deletedFolderIds.add(pendingFolderId);
      const childFolderIds = childIdsByParent.get(pendingFolderId) ?? [];
      for (const childFolderId of childFolderIds) {
        pendingFolderIds.push(childFolderId);
      }
    }

    await deleteFolderCascade(folderDeleteCandidate.id);
    await refreshHistoryData();
    setSelectedFolderId(previousSelectedFolderId =>
      previousSelectedFolderId && deletedFolderIds.has(previousSelectedFolderId)
        ? null
        : previousSelectedFolderId,
    );
    setFolderDeleteCandidate(null);
  }, [folderDeleteCandidate, folders, refreshHistoryData]);

  const toggleAngleMode = useCallback(() => {
    const nextMode: AngleMode = angleMode === 'DEG' ? 'RAD' : 'DEG';
    setAngleMode(nextMode);
    persistAngleMode(nextMode).catch(() => {});
  }, [angleMode]);

  const onCreateFolder = useCallback(async () => {
    const trimmedName = folderNameDraft.trim();
    if (!trimmedName) {
      return;
    }

    try {
      const folder = await createFolder(trimmedName, selectedFolderId);
      setFolders(previousFolders =>
        [...previousFolders, folder].sort(
          (left, right) => left.createdAt - right.createdAt,
        ),
      );
      setFolderNameDraft('');
    } catch (error) {
      Alert.alert(
        'Folder error',
        error instanceof Error ? error.message : 'Unable to create folder',
      );
    }
  }, [folderNameDraft, selectedFolderId]);

  const scrollToPage = useCallback(
    (pageIndex: number) => {
      pagerRef.current?.scrollTo({
        y: pageIndex * keypadPageHeight,
        animated: true,
      });
      setActiveKeypadPage(pageIndex);
    },
    [keypadPageHeight],
  );

  const topRowButtons: ButtonSpec[] = [
    {label: '', disabled: true},
    {label: '⌫', token: 'BACKSPACE', textStyle: styles.topRowIconText},
    {label: 'C', token: 'CLEAR', textStyle: styles.topRowKeyText},
    {label: '÷', token: '÷', textStyle: styles.divideKeyText},
  ];

  const basicLeftRows: ButtonSpec[][] = [
    [
      {label: '%', token: '%'},
      {label: '(', token: '('},
      {label: ')', token: ')'},
    ],
    [
      {label: '7', token: '7'},
      {label: '8', token: '8'},
      {label: '9', token: '9'},
    ],
    [
      {label: '4', token: '4'},
      {label: '5', token: '5'},
      {label: '6', token: '6'},
    ],
    [
      {label: '1', token: '1'},
      {label: '2', token: '2'},
      {label: '3', token: '3'},
    ],
    [
      {label: '', disabled: true},
      {label: '0', token: '0'},
      {label: '.', token: '.'},
    ],
  ];

  const basicRightColumnButtons: Array<ButtonSpec & {flex: number}> = [
    {label: '×', token: '×', flex: 1},
    {label: '−', token: '-', flex: 1},
    {label: '+', token: '+', flex: 1},
    {
      label: '=',
      action: () => {
        onEqualsPress().catch(() => {});
      },
      flex: 2,
    },
  ];

  const renderButton = (
    spec: ButtonSpec,
    key: string,
    style?: object,
  ): React.JSX.Element => (
    <Pressable
      key={key}
      disabled={spec.disabled}
      onPress={
        spec.disabled
          ? undefined
          : spec.action ??
            (spec.token ? () => onTokenPress(spec.token as string) : undefined)
      }
      style={({pressed}) => [
        styles.keyButton,
        spec.disabled ? styles.keyButtonDisabled : null,
        style,
        pressed ? styles.keyButtonPressed : null,
      ]}>
      <Text style={[styles.keyText, spec.textStyle]}>{spec.label}</Text>
    </Pressable>
  );

  const parentFolderPath = selectedFolderId
    ? getFolderPath(folders, selectedFolderId)
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <View style={styles.topBar}>
        <Pressable
          style={({pressed}) => [
            styles.iconButton,
            pressed ? styles.iconButtonPressed : null,
          ]}
          onPress={openMenu}>
          <Text style={styles.iconButtonText}>☰</Text>
        </Pressable>
      </View>

      <View style={styles.displayWrap}>
        <ScrollView
          ref={topDisplayRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.topDisplayScrollContent}>
          <Text style={styles.topDisplayText}>{topDisplayValue || ' '}</Text>
        </ScrollView>

        <View style={styles.inputWrap}>
          <TextInput
            ref={expressionInputRef}
            value={expression}
            placeholder="0"
            placeholderTextColor="#8d9098"
            style={styles.expressionInput}
            onFocus={onExpressionFocus}
            onSelectionChange={onExpressionSelectionChange}
            onTouchStart={onExpressionTouchStart}
            onTouchMove={onExpressionTouchMove}
            onTouchEnd={onExpressionTouchEnd}
            onTouchCancel={onExpressionTouchEnd}
            onChangeText={nextValue => {
              expressionRef.current = nextValue;
              setExpression(nextValue);
              setCommittedResult(null);
              setEqualsCommitted(false);
            }}
            autoCorrect={false}
            autoCapitalize="none"
            multiline={false}
            scrollEnabled
            showSoftInputOnFocus={false}
            caretHidden={!isExpressionCursorVisible}
            selection={isExpressionCursorVisible ? inputSelection : undefined}
            selectionColor="#d7d9de"
            textAlign="right"
          />
        </View>
      </View>

      <Pressable
        style={({pressed}) => [
          styles.pageToggle,
          pressed ? styles.iconButtonPressed : null,
        ]}
        onPress={() => scrollToPage(activeKeypadPage === 0 ? 1 : 0)}>
        <Text style={styles.pageToggleText}>
          {activeKeypadPage === 0 ? '⌄' : '⌃'}
        </Text>
      </Pressable>

      <View
        style={styles.keypadViewport}
        onLayout={event => {
          const measuredHeight = Math.max(240, event.nativeEvent.layout.height);
          if (Math.abs(measuredHeight - keypadPageHeight) > 1) {
            setKeypadPageHeight(measuredHeight);
          }
        }}>
        <ScrollView
          ref={pagerRef}
          horizontal={false}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={event => {
            const nextPage = Math.round(
              event.nativeEvent.contentOffset.y / keypadPageHeight,
            );
            setActiveKeypadPage(nextPage > 0 ? 1 : 0);
          }}>
          <View style={[styles.keypadPage, {height: keypadPageHeight}]}> 
            <View style={styles.topKeyRow}>
              {topRowButtons.map((button, index) =>
                renderButton(button, `top-${index}`, styles.topRowButton),
              )}
            </View>

            <View style={styles.basicGrid}>
              <View style={styles.basicLeftSection}>
                {basicLeftRows.map((row, rowIndex) => (
                  <View key={`row-${rowIndex}`} style={styles.leftRow}>
                    {row.map((button, buttonIndex) =>
                      renderButton(
                        button,
                        `left-${rowIndex}-${buttonIndex}`,
                        styles.gridButton,
                      ),
                    )}
                  </View>
                ))}
              </View>

              <View style={styles.basicRightSection}>
                {basicRightColumnButtons.map((button, index) =>
                  renderButton(button, `right-${index}`, {flex: button.flex}),
                )}
              </View>
            </View>
          </View>

          <View style={[styles.keypadPage, {height: keypadPageHeight}]}> 
            <View style={styles.scientificGrid}>
              {SCIENTIFIC_LAYOUT.map((row, rowIndex) => (
                <View key={`sci-row-${rowIndex}`} style={styles.scientificRow}>
                  {row.map((item, colIndex) => {
                    if (!item) {
                      return (
                        <View
                          key={`sci-empty-${rowIndex}-${colIndex}`}
                          style={styles.scientificEmptyCell}
                        />
                      );
                    }

                    return renderButton(
                      {
                        label: item.label,
                        token: item.token,
                        textStyle: styles.scientificKeyText,
                      },
                      `sci-${rowIndex}-${colIndex}`,
                      styles.scientificButton,
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      {bannerEntry ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText} numberOfLines={1}>
            Saved to Recents: {bannerEntry.expression} = {bannerEntry.result}
          </Text>
          <Pressable onPress={() => openMovePicker(bannerEntry)}>
            <Text style={styles.bannerActionText}>Move</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.menuBackdrop}>
          <View style={styles.menuPanel}>
            <Text style={styles.menuHeader}>Menu</Text>

            <View style={styles.menuActionsWrap}>
              <Pressable style={styles.menuAction} onPress={toggleAngleMode}>
                <Text style={styles.menuActionText}>Angle Mode: {angleMode}</Text>
              </Pressable>
              <Pressable style={styles.menuAction} onPress={openFolderManager}>
                <Text style={styles.menuActionText}>Manage Folders</Text>
              </Pressable>
            </View>

            <Text style={styles.historySectionTitle}>History</Text>
            <Text style={styles.historyHint}>
              Tap to load calculation • Swipe left to delete
            </Text>

            <ScrollView style={styles.historyTreeScroll}>
              {historyTreeItems.length === 0 ? (
                <Text style={styles.emptyStateText}>No saved calculations yet.</Text>
              ) : (
                historyTreeItems.map(item => {
                  const isFolder = item.type === 'folder';
                  const rowIndent = 12 + item.depth * 16;

                  if (isFolder) {
                    return (
                      <View
                        key={item.id}
                        style={[styles.treeRow, styles.treeFolderRow, {paddingLeft: rowIndent}]}> 
                        <Text style={styles.treeFolderIcon}>▸</Text>
                        <Text style={styles.treeFolderText} numberOfLines={1}>
                          {item.label}
                        </Text>
                      </View>
                    );
                  }

                  const entry = item.entry as HistoryEntry;
                  return (
                    <Pressable
                      key={item.id}
                      style={({pressed}) => [
                        styles.treeRow,
                        {paddingLeft: rowIndent},
                        pressed ? styles.treeRowPressed : null,
                      ]}
                      onPressIn={event => onHistoryEntryPressIn(entry.id, event)}
                      onPressOut={event => onHistoryEntryPressOut(entry, event)}>
                      <View style={styles.treeEntryMain}>
                        <Text style={styles.treeEntryIcon}>•</Text>
                        <Text style={styles.treeEntryText} numberOfLines={1}>
                          {item.label}
                        </Text>
                      </View>

                      {item.canMove ? (
                        <Pressable
                          onPress={event => {
                            event.stopPropagation();
                            openMovePicker(entry);
                          }}>
                          <Text style={styles.treeMoveText}>Move</Text>
                        </Pressable>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>

          <Pressable
            style={styles.menuOverlayTouch}
            onPress={() => setMenuVisible(false)}
          />
        </View>
      </Modal>

      <Modal
        visible={folderPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setFolderDeleteCandidate(null);
          setFolderPickerVisible(false);
        }}>
        <View style={styles.backdrop}>
          <View
            style={[
              styles.folderModal,
              entryPendingMove ? styles.folderModalMove : null,
            ]}>
            <Text style={styles.folderModalTitle}>
              {entryPendingMove ? 'Move Calculation To' : 'Folders'}
            </Text>
            {!entryPendingMove ? (
              <Text style={styles.folderHintText}>
                Tap to choose parent folder. Swipe left on a folder to delete the
                folder tree.
              </Text>
            ) : null}

            <ScrollView
              style={[
                styles.folderList,
                entryPendingMove ? styles.folderListMove : null,
              ]}>
              <Pressable
                style={[
                  styles.folderRow,
                  selectedFolderId === null ? styles.selectedFolderRow : null,
                ]}
                onPress={() => {
                  if (entryPendingMove) {
                    moveEntryToFolder(entryPendingMove, null).catch(() => {});
                    return;
                  }

                  setSelectedFolderId(null);
                }}>
                <Text style={styles.folderRowText}>Recents</Text>
              </Pressable>

              {folderOptions.map(option => (
                <Pressable
                  key={option.id}
                  style={[
                    styles.folderRow,
                    selectedFolderId === option.id
                      ? styles.selectedFolderRow
                      : null,
                    {paddingLeft: 14 + option.depth * 18},
                  ]}
                  onPressIn={event => onFolderPressIn(option.id, event)}
                  onPressOut={event => onFolderPressOut(option, event)}>
                  <Text style={styles.folderRowText}>{option.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {entryPendingMove ? (
              <Pressable
                style={styles.folderActionButton}
                onPress={() => {
                  setFolderDeleteCandidate(null);
                  setFolderPickerVisible(false);
                }}>
                <Text style={styles.folderActionText}>Cancel</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.folderParentHint}>
                  Parent: {parentFolderPath ?? 'Root'}
                </Text>
                <TextInput
                  style={styles.folderInput}
                  value={folderNameDraft}
                  onChangeText={setFolderNameDraft}
                  placeholder="new folder name"
                  placeholderTextColor="#666666"
                />

                <View style={styles.folderActions}>
                  <Pressable
                    style={styles.folderActionButton}
                    onPress={() => {
                      setFolderDeleteCandidate(null);
                      setFolderPickerVisible(false);
                    }}>
                    <Text style={styles.folderActionText}>Close</Text>
                  </Pressable>
                  <Pressable
                    style={styles.folderActionButton}
                    onPress={() => {
                      onCreateFolder().catch(() => {});
                    }}>
                    <Text style={styles.folderActionText}>Create</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={folderDeleteCandidate !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFolderDeleteCandidate(null)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete folder?</Text>
            <Text style={styles.confirmMessage}>
              {folderDeleteCandidate
                ? `"${folderDeleteCandidate.name}" and all nested folders and saved calculations will be removed permanently.`
                : ''}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={styles.confirmCancelButton}
                onPress={() => setFolderDeleteCandidate(null)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmDeleteButton}
                onPress={() => {
                  deleteFolderWithChildren().catch(() => {});
                }}>
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 30,
    paddingBottom: 6,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  iconButtonPressed: {
    opacity: 0.6,
  },
  iconButtonText: {
    color: '#e2e3e7',
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '300',
  },
  displayWrap: {
    minHeight: 136,
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 2,
  },
  topDisplayScrollContent: {
    minWidth: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  topDisplayText: {
    textAlign: 'right',
    color: '#8e929a',
    fontSize: 48,
    lineHeight: 54,
    fontWeight: '300',
    minHeight: 56,
  },
  inputWrap: {
    minHeight: 50,
    justifyContent: 'center',
  },
  expressionInput: {
    color: '#d7d9de',
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '200',
    paddingVertical: 0,
    paddingHorizontal: 2,
    textAlign: 'right',
    includeFontPadding: false,
  },
  pageToggle: {
    alignSelf: 'center',
    width: 44,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    zIndex: 5,
  },
  pageToggleText: {
    color: '#d5d7dd',
    fontSize: 22,
    fontWeight: '300',
  },
  keypadViewport: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 6,
  },
  keypadPage: {
    width: '100%',
  },
  topKeyRow: {
    flexDirection: 'row',
    flex: 1,
  },
  topRowButton: {
    flex: 1,
    marginBottom: 1.5,
  },
  basicGrid: {
    flex: 5,
    flexDirection: 'row',
  },
  basicLeftSection: {
    flex: 3,
  },
  leftRow: {
    flex: 1,
    flexDirection: 'row',
  },
  basicRightSection: {
    flex: 1,
  },
  gridButton: {
    flex: 1,
  },
  keyButton: {
    borderWidth: 0.7,
    borderColor: '#202227',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1,
    backgroundColor: '#050506',
    minHeight: 46,
  },
  keyButtonDisabled: {
    backgroundColor: '#020203',
  },
  keyButtonPressed: {
    backgroundColor: '#101216',
  },
  keyText: {
    color: '#d7d9de',
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '300',
  },
  divideKeyText: {
    fontSize: 30,
    lineHeight: 34,
  },
  signText: {
    fontSize: 30,
    lineHeight: 34,
  },
  topRowKeyText: {
    fontSize: 24,
    lineHeight: 28,
  },
  topRowIconText: {
    fontSize: 28,
    lineHeight: 32,
  },
  scientificKeyText: {
    fontSize: 18,
    lineHeight: 22,
  },
  scientificGrid: {
    flex: 1,
  },
  scientificRow: {
    flex: 1,
    flexDirection: 'row',
  },
  scientificButton: {
    flex: 1,
  },
  scientificEmptyCell: {
    flex: 1,
    margin: 1,
    backgroundColor: 'transparent',
  },
  banner: {
    position: 'relative',
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#0f1115',
    borderWidth: 2,
    borderColor: '#2b2d33',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerText: {
    color: '#b9bcc4',
    fontSize: 16,
    maxWidth: '80%',
  },
  bannerActionText: {
    color: '#d7d9de',
    fontSize: 16,
    fontWeight: '600',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    flexDirection: 'row',
  },
  menuOverlayTouch: {
    flex: 1,
  },
  menuPanel: {
    width: '82%',
    maxWidth: 400,
    backgroundColor: '#07080a',
    borderRightWidth: 1,
    borderColor: '#21232a',
    paddingTop: 22,
    paddingBottom: 14,
    paddingHorizontal: 14,
  },
  menuHeader: {
    color: '#d7d9de',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '400',
    marginBottom: 10,
  },
  menuActionsWrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#1e2128',
    marginBottom: 10,
    paddingBottom: 10,
    gap: 6,
  },
  menuAction: {
    minHeight: 34,
    justifyContent: 'center',
  },
  menuActionText: {
    color: '#d7d9de',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  historySectionTitle: {
    color: '#d7d9de',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '400',
  },
  historyHint: {
    color: '#8f939d',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
    marginTop: 4,
  },
  historyTreeScroll: {
    flex: 1,
  },
  treeRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#14161b',
    paddingRight: 8,
  },
  treeFolderRow: {
    backgroundColor: '#090b10',
  },
  treeRowPressed: {
    backgroundColor: '#12151b',
  },
  treeFolderIcon: {
    color: '#a8adb8',
    fontSize: 13,
    lineHeight: 18,
    marginRight: 8,
  },
  treeFolderText: {
    color: '#d1d4db',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    flex: 1,
  },
  treeEntryMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  treeEntryIcon: {
    color: '#8f939d',
    fontSize: 16,
    lineHeight: 18,
    marginRight: 8,
  },
  treeEntryText: {
    color: '#c4c8d1',
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  treeMoveText: {
    color: '#d7d9de',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyStateText: {
    color: '#858993',
    fontSize: 14,
    paddingTop: 20,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
  },
  folderModal: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#262932',
    borderRadius: 8,
    backgroundColor: '#08090b',
    paddingHorizontal: 12,
    paddingVertical: 14,
    maxHeight: '82%',
  },
  folderModalMove: {
    maxHeight: '98%',
  },
  folderModalTitle: {
    color: '#d7d9de',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '400',
    marginBottom: 10,
  },
  folderHintText: {
    color: '#9095a0',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  folderList: {
    borderWidth: 1,
    borderColor: '#202227',
    borderRadius: 6,
    maxHeight: 300,
    marginBottom: 10,
  },
  folderListMove: {
    maxHeight: 360,
  },
  folderRow: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#17191d',
  },
  selectedFolderRow: {
    backgroundColor: '#12151b',
  },
  folderRowText: {
    color: '#d0d2d7',
    fontSize: 14,
    lineHeight: 20,
  },
  folderParentHint: {
    color: '#8c9099',
    fontSize: 13,
    marginBottom: 8,
  },
  folderInput: {
    borderWidth: 1,
    borderColor: '#262932',
    borderRadius: 6,
    color: '#d7d9de',
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  folderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  folderActionButton: {
    borderWidth: 1,
    borderColor: '#2a2d36',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 5,
    backgroundColor: '#0f1116',
  },
  folderActionText: {
    color: '#d7d9de',
    fontSize: 14,
    fontWeight: '500',
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2b2f39',
    backgroundColor: '#07090d',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  confirmTitle: {
    color: '#f4f5f7',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '500',
    marginBottom: 8,
  },
  confirmMessage: {
    color: '#b7bcc8',
    fontSize: 14,
    lineHeight: 20,
  },
  confirmActions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmCancelButton: {
    borderWidth: 1,
    borderColor: '#2b3039',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: '#0e1118',
  },
  confirmDeleteButton: {
    borderWidth: 1,
    borderColor: '#f2f3f5',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: '#f2f3f5',
  },
  confirmCancelText: {
    color: '#d6d9df',
    fontSize: 14,
    fontWeight: '500',
  },
  confirmDeleteText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default App;
