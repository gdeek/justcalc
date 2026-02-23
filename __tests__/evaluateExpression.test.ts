import {evaluateExpression} from '../src/core/evaluator/evaluateExpression';

describe('evaluateExpression', () => {
  test('applies bodmas precedence', () => {
    const result = evaluateExpression('2+3×4', 'DEG');
    expect(result.error).toBeNull();
    expect(result.value).toBe('14');
  });

  test('auto balances open parentheses before evaluation', () => {
    const result = evaluateExpression('(2+3×4', 'DEG');
    expect(result.error).toBeNull();
    expect(result.value).toBe('14');
  });

  test('supports right associative exponentiation', () => {
    const result = evaluateExpression('2^3^2', 'DEG');
    expect(result.error).toBeNull();
    expect(result.value).toBe('512');
  });

  test('supports implicit multiplication with parentheses and constants', () => {
    const result = evaluateExpression('2(3+4)+π', 'DEG');
    expect(result.error).toBeNull();
    expect(Number(result.value)).toBeCloseTo(17.1415926535, 8);
  });

  test('handles trigonometric functions in degree mode', () => {
    const result = evaluateExpression('sin(30)', 'DEG');
    expect(result.error).toBeNull();
    expect(Number(result.value)).toBeCloseTo(0.5, 10);
  });

  test('handles trigonometric functions in radian mode', () => {
    const result = evaluateExpression('sin(0.5235987755982988)', 'RAD');
    expect(result.error).toBeNull();
    expect(Number(result.value)).toBeCloseTo(0.5, 10);
  });

  test('supports scientific operations and factorial', () => {
    const result = evaluateExpression('log2(8)+3!', 'DEG');
    expect(result.error).toBeNull();
    expect(result.value).toBe('9');
  });

  test('returns error on invalid domain and division by zero', () => {
    expect(evaluateExpression('sqrt(-1)', 'DEG').value).toBe('Error');
    expect(evaluateExpression('10/0', 'DEG').value).toBe('Error');
  });
});
