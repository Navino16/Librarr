import { EditionFormat } from './types';

const EBOOK_FORMATS = ['ebook', 'kindle', 'nook', 'digital', 'epub', 'pdf'];
const AUDIOBOOK_FORMATS = [
  'audiobook',
  'audio cd',
  'audio cassette',
  'audible',
];

/**
 * Classify a raw edition format string (e.g. from Hardcover or OpenLibrary)
 * into a normalized EditionFormat value.
 */
export function classifyFormat(editionFormat?: string): EditionFormat {
  if (!editionFormat) return 'unknown';

  const fmt = editionFormat.toLowerCase();

  if (EBOOK_FORMATS.some((f) => fmt.includes(f))) return 'ebook';
  if (AUDIOBOOK_FORMATS.some((f) => fmt.includes(f))) return 'audiobook';
  if (fmt.includes('paperback') || fmt.includes('mass market'))
    return 'paperback';
  if (fmt.includes('hardcover') || fmt.includes('hardback'))
    return 'hardcover';

  return 'unknown';
}
