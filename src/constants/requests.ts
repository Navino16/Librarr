import type { DeclineReason } from '../types/api';

export const declineReasonTranslationKeys: Record<DeclineReason, string> = {
  not_available: 'reasonNotAvailable',
  duplicate: 'reasonDuplicate',
  already_in_library: 'reasonAlreadyInLibrary',
  not_appropriate: 'reasonNotAppropriate',
  quality_not_met: 'reasonQualityNotMet',
  other: 'reasonOther',
};
