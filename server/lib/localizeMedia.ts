// TODO: Implement localization for BookRequest model
// Localize work titles/covers using the MetadataResolver based on user locale.

import { BookRequest } from '../entity/BookRequest';

/**
 * Stub: returns requests as-is without localization.
 * Will be reimplemented when BookRequest routes are wired up.
 */
export async function localizeBookRequests(
  requests: BookRequest[],
  _locale?: string
): Promise<BookRequest[]> {
  // TODO: Localize work titles/covers using MetadataResolver
  return requests;
}
