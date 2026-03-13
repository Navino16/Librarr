import { RequestStatus } from '../constants/work';

interface WorkWithRequests {
  requests?: { status: number; format?: string }[];
}

/**
 * Checks whether all enabled book formats have a completed request,
 * meaning there is nothing left to request for this book.
 */
export function isBookFullyAvailable(
  work: WorkWithRequests | undefined | null,
  enableEbook: boolean,
  enableAudiobook: boolean
): boolean {
  if (!work) return false;
  const requests = work.requests ?? [];
  const completedFormats = new Set(
    requests
      .filter((r) => r.status === RequestStatus.COMPLETED)
      .map((r) => r.format)
  );
  if (enableEbook && !completedFormats.has('ebook')) return false;
  if (enableAudiobook && !completedFormats.has('audiobook')) return false;
  return true;
}

interface AlbumWithRequests {
  requests?: { status: number }[];
}

/**
 * Checks whether a music item has any completed request.
 */
export function isMusicFullyAvailable(
  album: AlbumWithRequests | undefined | null
): boolean {
  if (!album) return false;
  const requests = album.requests ?? [];
  return requests.some((r) => r.status === RequestStatus.COMPLETED);
}
