export enum WorkStatus {
  UNKNOWN = 1,
  PENDING = 2,
  PROCESSING = 3,
  PARTIALLY_AVAILABLE = 4,
  AVAILABLE = 5,
}

export enum RequestStatus {
  PENDING = 1,
  APPROVED = 2,
  DECLINED = 3,
  COMPLETED = 4,
  FAILED = 5,
}

export type BookFormat = 'ebook' | 'audiobook';
export const BookFormat = {
  EBOOK: 'ebook' as const,
  AUDIOBOOK: 'audiobook' as const,
};

export const DeclineReasons = [
  'not_available',
  'duplicate',
  'already_in_library',
  'not_appropriate',
  'quality_not_met',
  'other',
] as const;

export type DeclineReason = (typeof DeclineReasons)[number];
