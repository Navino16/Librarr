import { describe, it, expect } from 'vitest';
import { classifyFormat } from '@server/api/metadata/formatClassifier';

describe('classifyFormat', () => {
  it('returns "unknown" for undefined', () => {
    expect(classifyFormat(undefined)).toBe('unknown');
  });

  it('returns "unknown" for empty string', () => {
    expect(classifyFormat('')).toBe('unknown');
  });

  it('returns "unknown" for unrecognized format', () => {
    expect(classifyFormat('scroll')).toBe('unknown');
  });

  describe('ebook formats', () => {
    it.each([
      'ebook',
      'Ebook',
      'Kindle',
      'kindle edition',
      'Nook',
      'Digital',
      'epub',
      'PDF',
    ])('classifies "%s" as ebook', (input) => {
      expect(classifyFormat(input)).toBe('ebook');
    });
  });

  describe('audiobook formats', () => {
    it.each([
      'audiobook',
      'Audiobook',
      'Audio CD',
      'audio cassette',
      'Audible',
      'audible audio',
    ])('classifies "%s" as audiobook', (input) => {
      expect(classifyFormat(input)).toBe('audiobook');
    });
  });

  describe('paperback formats', () => {
    it.each([
      'Paperback',
      'paperback',
      'Mass Market',
      'mass market paperback',
    ])('classifies "%s" as paperback', (input) => {
      expect(classifyFormat(input)).toBe('paperback');
    });
  });

  describe('hardcover formats', () => {
    it.each([
      'Hardcover',
      'hardcover',
      'Hardback',
      'hardback edition',
    ])('classifies "%s" as hardcover', (input) => {
      expect(classifyFormat(input)).toBe('hardcover');
    });
  });
});
