import { describe, it, expect } from 'vitest';
import { param, parseId, safeInt } from '@server/utils/params';

describe('param', () => {
  it('returns the string as-is', () => {
    expect(param('hello')).toBe('hello');
  });

  it('returns first element of an array', () => {
    expect(param(['a', 'b'])).toBe('a');
  });

  it('returns empty string for undefined', () => {
    expect(param(undefined)).toBe('');
  });

  it('returns empty string for empty array', () => {
    expect(param([])).toBe('');
  });
});

describe('parseId', () => {
  it('parses a valid positive integer', () => {
    expect(parseId('42')).toBe(42);
  });

  it('returns null for zero', () => {
    expect(parseId('0')).toBeNull();
  });

  it('returns null for negative numbers', () => {
    expect(parseId('-5')).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(parseId('abc')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseId('')).toBeNull();
  });

  it('parses string with trailing text (parseInt behavior)', () => {
    expect(parseId('10abc')).toBe(10);
  });
});

describe('safeInt', () => {
  it('returns the parsed value for valid input', () => {
    expect(safeInt('25', 10)).toBe(25);
  });

  it('returns default for undefined', () => {
    expect(safeInt(undefined, 10)).toBe(10);
  });

  it('returns default for non-numeric string', () => {
    expect(safeInt('abc', 5)).toBe(5);
  });

  it('returns default for negative numbers', () => {
    expect(safeInt('-1', 20)).toBe(20);
  });

  it('returns 0 for "0"', () => {
    expect(safeInt('0', 10)).toBe(0);
  });

  it('returns default for empty string', () => {
    expect(safeInt('', 10)).toBe(10);
  });
});
