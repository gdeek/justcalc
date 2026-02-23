import {canEvaluateExpression, insertToken} from '../src/core/parser/insertToken';

describe('insertToken', () => {
  test('inserts numbers and decimals without duplicate decimal points', () => {
    let expression = '';
    expression = insertToken(expression, '1');
    expression = insertToken(expression, '2');
    expression = insertToken(expression, '.');
    expression = insertToken(expression, '3');
    expression = insertToken(expression, '.');

    expect(expression).toBe('12.3');
  });

  test('adds implicit multiplication before opening parentheses', () => {
    const expression = insertToken('2', '(');
    expect(expression).toBe('2×(');
  });

  test('auto-wraps expression on close parenthesis and allows valid close parentheses', () => {
    expect(insertToken('', ')')).toBe('()');
    expect(insertToken('2+3', ')')).toBe('(2+3)');
    expect(insertToken('(2+3', ')')).toBe('(2+3)');
  });

  test('toggles sign on the current number', () => {
    expect(insertToken('12', 'NEGATE')).toBe('-12');
    expect(insertToken('-12', 'NEGATE')).toBe('12');
    expect(insertToken('4+7', 'NEGATE')).toBe('4+-7');
  });

  test('supports function and power shortcut tokens', () => {
    expect(insertToken('2', 'POW2')).toBe('2^2');
    expect(insertToken('3', 'INV')).toBe('3^-1');
    expect(insertToken('2', 'FUNC:sqrt')).toBe('2×sqrt(');
  });

  test('supports backspace and clear control tokens', () => {
    expect(insertToken('123', 'BACKSPACE')).toBe('12');
    expect(insertToken('123', 'CLEAR')).toBe('');
  });
});

describe('canEvaluateExpression', () => {
  test('rejects incomplete expressions and accepts complete expressions', () => {
    expect(canEvaluateExpression('')).toBe(false);
    expect(canEvaluateExpression('2+')).toBe(false);
    expect(canEvaluateExpression('(2+3')).toBe(true);
    expect(canEvaluateExpression('2+3')).toBe(true);
  });
});
