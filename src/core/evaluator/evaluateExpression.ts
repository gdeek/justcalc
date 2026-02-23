import type { AngleMode, EvalResult } from './types';

type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '^';
type UnaryOperator = 'u+' | 'u-' | '!';
type Operator = BinaryOperator | UnaryOperator;
type FunctionName =
  | 'sin'
  | 'cos'
  | 'tan'
  | 'asin'
  | 'acos'
  | 'atan'
  | 'sinh'
  | 'tanh'
  | 'asinh'
  | 'acosh'
  | 'log10'
  | 'ln'
  | 'log2'
  | 'sqrt'
  | 'cbrt';

type NumberToken = {
  type: 'number';
  value: number;
};

type OperatorToken = {
  type: 'operator';
  value: Operator;
};

type FunctionToken = {
  type: 'function';
  value: FunctionName;
};

type ParenToken = {
  type: 'leftParen' | 'rightParen';
};

type Token = NumberToken | OperatorToken | FunctionToken | ParenToken;

const FUNCTION_NAMES = new Set<FunctionName>([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'tanh',
  'asinh',
  'acosh',
  'log10',
  'ln',
  'log2',
  'sqrt',
  'cbrt',
]);

const OPERATOR_PRECEDENCE: Record<Operator, number> = {
  '!': 6,
  'u+': 5,
  'u-': 5,
  '^': 4,
  '*': 3,
  '/': 3,
  '%': 3,
  '+': 2,
  '-': 2,
};

const OPERATOR_ASSOCIATIVITY: Record<Operator, 'left' | 'right'> = {
  '!': 'left',
  'u+': 'right',
  'u-': 'right',
  '^': 'right',
  '*': 'left',
  '/': 'left',
  '%': 'left',
  '+': 'left',
  '-': 'left',
};

const BINARY_OPERATORS = new Set<BinaryOperator>(['+', '-', '*', '/', '%', '^']);

const normalizeExpression = (expression: string): string =>
  expression
    .replace(/\s+/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-');

const isDigit = (value: string): boolean => value >= '0' && value <= '9';

const isIdentifierChar = (value: string): boolean =>
  (value >= 'a' && value <= 'z') ||
  (value >= 'A' && value <= 'Z') ||
  isDigit(value);

const isPostfixFactorial = (token: Token): boolean =>
  token.type === 'operator' && token.value === '!';

const endsValue = (token: Token): boolean =>
  token.type === 'number' || token.type === 'rightParen' || isPostfixFactorial(token);

const startsValue = (token: Token): boolean =>
  token.type === 'number' || token.type === 'leftParen' || token.type === 'function';

const autoBalanceParentheses = (expression: string): string => {
  let openCount = 0;
  let closeCount = 0;

  for (const char of expression) {
    if (char === '(') {
      openCount += 1;
    } else if (char === ')') {
      closeCount += 1;
    }
  }

  if (openCount <= closeCount) {
    return expression;
  }

  return `${expression}${')'.repeat(openCount - closeCount)}`;
};

const tokenize = (expression: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;

  const pushSignedNumber = (sign: 1 | -1): void => {
    const start = index + 1;
    let cursor = start;
    let hasDot = false;

    if (expression[cursor] === '.') {
      hasDot = true;
      cursor += 1;
    }

    while (cursor < expression.length) {
      const char = expression[cursor];

      if (isDigit(char)) {
        cursor += 1;
        continue;
      }

      if (char === '.' && !hasDot) {
        hasDot = true;
        cursor += 1;
        continue;
      }

      break;
    }

    const numberString = expression.slice(start, cursor);
    if (numberString.length === 0 || numberString === '.') {
      throw new Error('invalid_signed_number');
    }

    tokens.push({
      type: 'number',
      value: sign * Number.parseFloat(numberString),
    });
    index = cursor;
  };

  while (index < expression.length) {
    const char = expression[index];
    const previous = tokens[tokens.length - 1];

    if (isDigit(char) || char === '.') {
      let cursor = index;
      let hasDot = char === '.';

      cursor += 1;
      while (cursor < expression.length) {
        const value = expression[cursor];
        if (isDigit(value)) {
          cursor += 1;
          continue;
        }
        if (value === '.' && !hasDot) {
          hasDot = true;
          cursor += 1;
          continue;
        }
        break;
      }

      const numberString = expression.slice(index, cursor);
      if (numberString === '.') {
        throw new Error('invalid_number');
      }

      tokens.push({type: 'number', value: Number.parseFloat(numberString)});
      index = cursor;
      continue;
    }

    if (char === '+' || char === '-') {
      const unaryContext =
        !previous ||
        previous.type === 'leftParen' ||
        previous.type === 'function' ||
        (previous.type === 'operator' && previous.value !== '!');

      if (unaryContext) {
        const next = expression[index + 1];
        if (next && (isDigit(next) || next === '.')) {
          pushSignedNumber(char === '+' ? 1 : -1);
          continue;
        }

        tokens.push({
          type: 'operator',
          value: char === '+' ? 'u+' : 'u-',
        });
        index += 1;
        continue;
      }

      tokens.push({type: 'operator', value: char});
      index += 1;
      continue;
    }

    if (char === '*' || char === '/' || char === '%' || char === '^' || char === '!') {
      tokens.push({type: 'operator', value: char});
      index += 1;
      continue;
    }

    if (char === '(') {
      tokens.push({type: 'leftParen'});
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({type: 'rightParen'});
      index += 1;
      continue;
    }

    if (char === 'π') {
      tokens.push({type: 'number', value: Math.PI});
      index += 1;
      continue;
    }

    if (isIdentifierChar(char)) {
      let cursor = index + 1;
      while (cursor < expression.length && isIdentifierChar(expression[cursor])) {
        cursor += 1;
      }

      const identifier = expression.slice(index, cursor).toLowerCase();
      if (identifier === 'e') {
        tokens.push({type: 'number', value: Math.E});
      } else if (identifier === 'pi') {
        tokens.push({type: 'number', value: Math.PI});
      } else if (FUNCTION_NAMES.has(identifier as FunctionName)) {
        tokens.push({type: 'function', value: identifier as FunctionName});
      } else {
        throw new Error(`unknown_identifier_${identifier}`);
      }

      index = cursor;
      continue;
    }

    throw new Error(`unknown_token_${char}`);
  }

  return tokens;
};

const withImplicitMultiplication = (tokens: Token[]): Token[] => {
  const expanded: Token[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const previous = expanded[expanded.length - 1];
    if (previous && endsValue(previous) && startsValue(token)) {
      expanded.push({type: 'operator', value: '*'});
    }
    expanded.push(token);
  }

  return expanded;
};

const shouldPopOperator = (stackToken: Token, currentOperator: Operator): boolean => {
  if (stackToken.type === 'function') {
    return true;
  }

  if (stackToken.type !== 'operator') {
    return false;
  }

  const stackPrecedence = OPERATOR_PRECEDENCE[stackToken.value];
  const currentPrecedence = OPERATOR_PRECEDENCE[currentOperator];
  const associativity = OPERATOR_ASSOCIATIVITY[currentOperator];

  if (associativity === 'left') {
    return currentPrecedence <= stackPrecedence;
  }

  return currentPrecedence < stackPrecedence;
};

const toRpn = (tokens: Token[]): Token[] => {
  const output: Token[] = [];
  const stack: Token[] = [];

  for (const token of tokens) {
    if (token.type === 'number') {
      output.push(token);
      continue;
    }

    if (token.type === 'function') {
      stack.push(token);
      continue;
    }

    if (token.type === 'operator') {
      while (stack.length > 0 && shouldPopOperator(stack[stack.length - 1], token.value)) {
        output.push(stack.pop() as Token);
      }

      stack.push(token);
      continue;
    }

    if (token.type === 'leftParen') {
      stack.push(token);
      continue;
    }

    while (stack.length > 0 && stack[stack.length - 1].type !== 'leftParen') {
      output.push(stack.pop() as Token);
    }

    if (stack.length === 0) {
      throw new Error('missing_left_parenthesis');
    }

    stack.pop();

    if (stack.length > 0 && stack[stack.length - 1].type === 'function') {
      output.push(stack.pop() as Token);
    }
  }

  while (stack.length > 0) {
    const token = stack.pop() as Token;
    if (token.type === 'leftParen' || token.type === 'rightParen') {
      throw new Error('mismatched_parentheses');
    }
    output.push(token);
  }

  return output;
};

const toRadians = (value: number): number => (value * Math.PI) / 180;
const toDegrees = (value: number): number => (value * 180) / Math.PI;

const validateUnitInterval = (value: number): void => {
  if (value < -1 || value > 1) {
    throw new Error('domain_error');
  }
};

const applyFunction = (
  functionName: FunctionName,
  value: number,
  angleMode: AngleMode,
): number => {
  switch (functionName) {
    case 'sin':
      return Math.sin(angleMode === 'DEG' ? toRadians(value) : value);
    case 'cos':
      return Math.cos(angleMode === 'DEG' ? toRadians(value) : value);
    case 'tan':
      return Math.tan(angleMode === 'DEG' ? toRadians(value) : value);
    case 'asin':
      validateUnitInterval(value);
      return angleMode === 'DEG' ? toDegrees(Math.asin(value)) : Math.asin(value);
    case 'acos':
      validateUnitInterval(value);
      return angleMode === 'DEG' ? toDegrees(Math.acos(value)) : Math.acos(value);
    case 'atan':
      return angleMode === 'DEG' ? toDegrees(Math.atan(value)) : Math.atan(value);
    case 'sinh':
      return Math.sinh(value);
    case 'tanh':
      return Math.tanh(value);
    case 'asinh':
      return Math.asinh(value);
    case 'acosh':
      if (value < 1) {
        throw new Error('domain_error');
      }
      return Math.acosh(value);
    case 'log10':
      if (value <= 0) {
        throw new Error('domain_error');
      }
      return Math.log10(value);
    case 'ln':
      if (value <= 0) {
        throw new Error('domain_error');
      }
      return Math.log(value);
    case 'log2':
      if (value <= 0) {
        throw new Error('domain_error');
      }
      return Math.log2(value);
    case 'sqrt':
      if (value < 0) {
        throw new Error('domain_error');
      }
      return Math.sqrt(value);
    case 'cbrt':
      return Math.cbrt(value);
    default:
      throw new Error('unknown_function');
  }
};

const factorial = (value: number): number => {
  if (!Number.isInteger(value) || value < 0 || value > 170) {
    throw new Error('domain_error');
  }

  let result = 1;
  for (let index = 2; index <= value; index += 1) {
    result *= index;
  }

  return result;
};

const applyOperator = (operator: Operator, stack: number[]): void => {
  if (operator === 'u+' || operator === 'u-' || operator === '!') {
    if (stack.length < 1) {
      throw new Error('invalid_expression');
    }

    const value = stack.pop() as number;
    if (operator === 'u+') {
      stack.push(value);
      return;
    }

    if (operator === 'u-') {
      stack.push(-value);
      return;
    }

    stack.push(factorial(value));
    return;
  }

  if (!BINARY_OPERATORS.has(operator)) {
    throw new Error('invalid_operator');
  }

  if (stack.length < 2) {
    throw new Error('invalid_expression');
  }

  const right = stack.pop() as number;
  const left = stack.pop() as number;

  switch (operator) {
    case '+':
      stack.push(left + right);
      return;
    case '-':
      stack.push(left - right);
      return;
    case '*':
      stack.push(left * right);
      return;
    case '/':
      if (right === 0) {
        throw new Error('division_by_zero');
      }
      stack.push(left / right);
      return;
    case '%':
      if (right === 0) {
        throw new Error('division_by_zero');
      }
      stack.push(left % right);
      return;
    case '^': {
      const value = Math.pow(left, right);
      if (!Number.isFinite(value)) {
        throw new Error('overflow');
      }
      stack.push(value);
      return;
    }
    default:
      throw new Error('unknown_operator');
  }
};

const evaluateRpn = (tokens: Token[], angleMode: AngleMode): number => {
  const stack: number[] = [];

  for (const token of tokens) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }

    if (token.type === 'function') {
      if (stack.length < 1) {
        throw new Error('invalid_expression');
      }

      const value = stack.pop() as number;
      stack.push(applyFunction(token.value, value, angleMode));
      continue;
    }

    if (token.type === 'operator') {
      applyOperator(token.value, stack);
      continue;
    }

    throw new Error('invalid_token_sequence');
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0])) {
    throw new Error('invalid_expression');
  }

  return stack[0];
};

const formatNumber = (value: number): string => {
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  if (!Number.isFinite(normalized)) {
    throw new Error('invalid_number');
  }

  return Number.parseFloat(normalized.toPrecision(14)).toString();
};

export const evaluateExpression = (
  expression: string,
  angleMode: AngleMode,
): EvalResult => {
  try {
    const normalized = normalizeExpression(expression);
    if (normalized.length === 0) {
      return {value: 'Error', error: 'empty_expression'};
    }

    const balanced = autoBalanceParentheses(normalized);
    const tokens = tokenize(balanced);
    const expandedTokens = withImplicitMultiplication(tokens);
    const rpn = toRpn(expandedTokens);
    const numericResult = evaluateRpn(rpn, angleMode);

    return {
      value: formatNumber(numericResult),
      error: null,
    };
  } catch (error) {
    return {
      value: 'Error',
      error: error instanceof Error ? error.message : 'evaluation_error',
    };
  }
};

export const balanceExpressionForEvaluation = (expression: string): string =>
  autoBalanceParentheses(normalizeExpression(expression));
