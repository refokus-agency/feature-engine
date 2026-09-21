import { describe, it, expect } from 'vitest';
import { serializeForCodeContext } from '../vite/escape-js.ts';

/**
 * Parses an emitted JS literal back to its runtime value, the way the bundler
 * would. Used to assert that escaping never changes what the module evaluates
 * to (AC-5).
 */
function evaluateLiteral(source: string): unknown {
  return new Function(`return (${source});`)();
}

describe('serializeForCodeContext', () => {
  describe('unsafe characters', () => {
    it('escapes < so a script element cannot be terminated', () => {
      const result = serializeForCodeContext('</script>');
      expect(result).toBe('"\\u003C/script\\u003E"');
      expect(result).not.toContain('<');
      expect(evaluateLiteral(result)).toBe('</script>');
    });

    it('escapes > while preserving the runtime value', () => {
      const result = serializeForCodeContext('.a > .b');
      expect(result).toBe('".a \\u003E .b"');
      expect(result).not.toContain('>');
      expect(evaluateLiteral(result)).toBe('.a > .b');
    });

    it('escapes U+2028', () => {
      const result = serializeForCodeContext('a\u2028b');
      expect(result).toBe('"a\\u2028b"');
      expect(result).not.toContain('\u2028');
      expect(evaluateLiteral(result)).toBe('a\u2028b');
    });

    it('escapes U+2029', () => {
      const result = serializeForCodeContext('a\u2029b');
      expect(result).toBe('"a\\u2029b"');
      expect(result).not.toContain('\u2029');
      expect(evaluateLiteral(result)).toBe('a\u2029b');
    });

    it('escapes unsafe characters inside every element of a string array', () => {
      const result = serializeForCodeContext(['<a>', '.x > .y']);
      expect(result).toBe('["\\u003Ca\\u003E",".x \\u003E .y"]');
      expect(evaluateLiteral(result)).toEqual(['<a>', '.x > .y']);
    });
  });

  describe('pass-through values', () => {
    it.each([
      ['a plain string', 'my-feature', '"my-feature"'],
      ['a string array', ['[data-a]', '[data-b]'], '["[data-a]","[data-b]"]'],
      ['an empty array', [], '[]'],
      ['a number', 3000, '3000'],
      ['a negative number', -1, '-1'],
      ['a boolean', true, 'true'],
      ['null', null, 'null'],
    ])(
      'emits %s byte-identically to JSON.stringify',
      (_label, value, expected) => {
        const result = serializeForCodeContext(
          value as Parameters<typeof serializeForCodeContext>[0],
        );
        expect(result).toBe(expected);
        expect(result).toBe(JSON.stringify(value));
        expect(evaluateLiteral(result)).toEqual(value);
      },
    );

    it('leaves / unescaped so file paths keep their emitted form', () => {
      const path = '/src/features/hero.feature.js';
      const result = serializeForCodeContext(path);
      expect(result).toBe(JSON.stringify(path));
      expect(evaluateLiteral(result)).toBe(path);
    });

    it('keeps the escaping JSON.stringify already applies', () => {
      const result = serializeForCodeContext('a"b\\c\nd');
      expect(result).toBe(JSON.stringify('a"b\\c\nd'));
      expect(evaluateLiteral(result)).toBe('a"b\\c\nd');
    });
  });
});
