// Frontend constants mirroring server/constants/work.ts and server/constants/music.ts
// Single source of truth for the frontend

// === Work Status (books) ===
export const WorkStatus = {
  UNKNOWN: 1,
  PENDING: 2,
  PROCESSING: 3,
  PARTIALLY_AVAILABLE: 4,
  AVAILABLE: 5,
} as const;

export type WorkStatusType = (typeof WorkStatus)[keyof typeof WorkStatus];

// === Request Status (BookRequest / MusicRequest) ===
export const RequestStatus = {
  PENDING: 1,
  APPROVED: 2,
  DECLINED: 3,
  COMPLETED: 4,
  FAILED: 5,
} as const;

export type RequestStatusType = (typeof RequestStatus)[keyof typeof RequestStatus];

// === Music Album Status ===
export const MusicAlbumStatus = {
  UNKNOWN: 1,
  PENDING: 2,
  PROCESSING: 3,
  PARTIALLY_AVAILABLE: 4,
  AVAILABLE: 5,
} as const;

export const DeclineReasons = [
  'not_available',
  'duplicate',
  'already_in_library',
  'not_appropriate',
  'quality_not_met',
  'other',
] as const;

export type DeclineReason = (typeof DeclineReasons)[number];
