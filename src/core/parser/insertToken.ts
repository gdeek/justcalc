const BINARY_OPERATORS = new Set(['+', '-', '×', '÷', '%', '^']);
const VALUE_ENDINGS = new Set(['π', 'e', ')', '!']);

const endsWithBinaryOperator = (expression: string): boolean =>
  expression.length > 0 && BINARY_OPERATORS.has(expression[expression.length - 1]);

export const getUnclosedParenthesesCount = (expression: string): number => {
  let openCount = 0;
  let closeCount = 0;

  for (const char of expression) {
    if (char === '(') {
      openCount += 1;
    } else if (char === ')') {
      closeCount += 1;
    }
  }

  return openCount - closeCount;
};

const canAppendValue = (expression: string): boolean => {
  if (expression.length === 0) {
    return false;
  }

  const lastChar = expression[expression.length - 1];
  if (VALUE_ENDINGS.has(lastChar)) {
    return true;
  }

  return /[0-9.]$/.test(lastChar);
};

const canImplicitMultiplyBeforeNumber = (expression: string): boolean => {
  if (expression.length === 0) {
    return false;
  }

  return VALUE_ENDINGS.has(expression[expression.length - 1]);
};

const getCurrentNumberSlice = (expression: string): string => {
  let index = expression.length - 1;

  while (index >= 0 && /[0-9.]/.test(expression[index])) {
    index -= 1;
  }

  return expression.slice(index + 1);
};

const appendWithImplicitMultiply = (expression: string, value: string): string =>
  canAppendValue(expression) ? `${expression}×${value}` : `${expression}${value}`;

const insertNumberOrDecimal = (expression: string, token: string): string => {
  const numberSlice = getCurrentNumberSlice(expression);

  if (token === '.') {
    if (numberSlice.includes('.')) {
      return expression;
    }

    if (numberSlice.length === 0) {
      return canImplicitMultiplyBeforeNumber(expression)
        ? `${expression}×0.`
        : `${expression}0.`;
    }

    return `${expression}.`;
  }

  if (numberSlice.length > 0) {
    return `${expression}${token}`;
  }

  return canImplicitMultiplyBeforeNumber(expression)
    ? `${expression}×${token}`
    : `${expression}${token}`;
};

const insertOperator = (expression: string, operator: string): string => {
  if (expression.length === 0) {
    return operator === '-' ? '-' : expression;
  }

  const lastChar = expression[expression.length - 1];
  if (BINARY_OPERATORS.has(lastChar)) {
    return `${expression.slice(0, -1)}${operator}`;
  }

  if (lastChar === '(') {
    return operator === '-' ? `${expression}-` : expression;
  }

  if (lastChar === '.') {
    return `${expression}0${operator}`;
  }

  return `${expression}${operator}`;
};

const insertOpenParenthesis = (expression: string): string =>
  appendWithImplicitMultiply(expression, '(');

const insertCloseParenthesis = (expression: string): string => {
  const unclosedCount = getUnclosedParenthesesCount(expression);
  if (unclosedCount > 0) {
    if (expression.length === 0) {
      return expression;
    }

    const lastChar = expression[expression.length - 1];
    if (BINARY_OPERATORS.has(lastChar) || lastChar === '(') {
      return expression;
    }

    return `${expression})`;
  }

  if (expression.length === 0) {
    return '()';
  }

  const lastChar = expression[expression.length - 1];
  if (BINARY_OPERATORS.has(lastChar) || lastChar === '(') {
    return expression;
  }

  return `(${expression})`;
};

const toggleSign = (expression: string): string => {
  if (expression.length === 0) {
    return '-';
  }

  const lastChar = expression[expression.length - 1];
  if (BINARY_OPERATORS.has(lastChar) || lastChar === '(') {
    return `${expression}-`;
  }

  if (/[0-9.]$/.test(lastChar)) {
    let cursor = expression.length - 1;
    while (cursor >= 0 && /[0-9.]/.test(expression[cursor])) {
      cursor -= 1;
    }

    const numberStart = cursor + 1;
    const signIndex = numberStart - 1;
    const hasUnaryMinus =
      signIndex >= 0 &&
      expression[signIndex] === '-' &&
      (signIndex === 0 ||
        BINARY_OPERATORS.has(expression[signIndex - 1]) ||
        expression[signIndex - 1] === '(');

    if (hasUnaryMinus) {
      return `${expression.slice(0, signIndex)}${expression.slice(numberStart)}`;
    }

    return `${expression.slice(0, numberStart)}-${expression.slice(numberStart)}`;
  }

  if (canAppendValue(expression)) {
    return `${expression}×(-1)`;
  }

  return expression;
};

const appendPower = (expression: string, powerSuffix = ''): string => {
  if (expression.length === 0) {
    return expression;
  }

  const lastChar = expression[expression.length - 1];
  if (BINARY_OPERATORS.has(lastChar) || lastChar === '(') {
    return expression;
  }

  return `${expression}^${powerSuffix}`;
};

const FUNCTION_TOKEN_MAP: Record<string, string> = {
  'FUNC:sin': 'sin',
  'FUNC:cos': 'cos',
  'FUNC:tan': 'tan',
  'FUNC:asin': 'asin',
  'FUNC:acos': 'acos',
  'FUNC:atan': 'atan',
  'FUNC:sinh': 'sinh',
  'FUNC:tanh': 'tanh',
  'FUNC:asinh': 'asinh',
  'FUNC:acosh': 'acosh',
  'FUNC:log10': 'log10',
  'FUNC:ln': 'ln',
  'FUNC:log2': 'log2',
  'FUNC:sqrt': 'sqrt',
  'FUNC:cbrt': 'cbrt',
};

export const insertToken = (currentExpression: string, token: string): string => {
  if (token === 'BACKSPACE') {
    return currentExpression.slice(0, -1);
  }

  if (token === 'CLEAR') {
    return '';
  }

  if (token === 'NEGATE') {
    return toggleSign(currentExpression);
  }

  if (token in FUNCTION_TOKEN_MAP) {
    return appendWithImplicitMultiply(
      currentExpression,
      `${FUNCTION_TOKEN_MAP[token]}(`,
    );
  }

  if (token === 'CONST:PI') {
    return appendWithImplicitMultiply(currentExpression, 'π');
  }

  if (token === 'CONST:E') {
    return appendWithImplicitMultiply(currentExpression, 'e');
  }

  if (token === 'POW') {
    return appendPower(currentExpression);
  }

  if (token === 'POW2') {
    return appendPower(currentExpression, '2');
  }

  if (token === 'POW3') {
    return appendPower(currentExpression, '3');
  }

  if (token === 'INV') {
    return appendPower(currentExpression, '-1');
  }

  if (token === 'FACTORIAL') {
    if (!canAppendValue(currentExpression)) {
      return currentExpression;
    }

    return `${currentExpression}!`;
  }

  if (token === '(') {
    return insertOpenParenthesis(currentExpression);
  }

  if (token === ')') {
    return insertCloseParenthesis(currentExpression);
  }

  if (/^[0-9.]$/.test(token)) {
    return insertNumberOrDecimal(currentExpression, token);
  }

  if (BINARY_OPERATORS.has(token)) {
    return insertOperator(currentExpression, token);
  }

  return currentExpression;
};

export const canEvaluateExpression = (expression: string): boolean => {
  if (expression.trim().length === 0) {
    return false;
  }

  const lastChar = expression[expression.length - 1];
  if (endsWithBinaryOperator(expression) || lastChar === '(') {
    return false;
  }

  return true;
};
