import { describe, it, expect } from 'vitest';
import { isBookFullyAvailable, isMusicFullyAvailable } from '@server/lib/availability';
import { RequestStatus } from '@server/constants/work';

describe('isBookFullyAvailable', () => {
  it('returns false for null work', () => {
    expect(isBookFullyAvailable(null, true, true)).toBe(false);
  });

  it('returns false for undefined work', () => {
    expect(isBookFullyAvailable(undefined, true, true)).toBe(false);
  });

  it('returns true when no formats are enabled', () => {
    expect(isBookFullyAvailable({}, false, false)).toBe(true);
  });

  it('returns true when no formats are enabled even with no requests', () => {
    expect(isBookFullyAvailable({ requests: [] }, false, false)).toBe(true);
  });

  it('returns false when ebook enabled but no completed ebook request', () => {
    expect(isBookFullyAvailable({ requests: [] }, true, false)).toBe(false);
  });

  it('returns false when audiobook enabled but no completed audiobook request', () => {
    expect(isBookFullyAvailable({ requests: [] }, false, true)).toBe(false);
  });

  it('returns true when ebook enabled and completed ebook request exists', () => {
    const work = {
      requests: [{ status: RequestStatus.COMPLETED, format: 'ebook' }],
    };
    expect(isBookFullyAvailable(work, true, false)).toBe(true);
  });

  it('returns true when audiobook enabled and completed audiobook request exists', () => {
    const work = {
      requests: [{ status: RequestStatus.COMPLETED, format: 'audiobook' }],
    };
    expect(isBookFullyAvailable(work, false, true)).toBe(true);
  });

  it('returns true when both formats enabled and both completed', () => {
    const work = {
      requests: [
        { status: RequestStatus.COMPLETED, format: 'ebook' },
        { status: RequestStatus.COMPLETED, format: 'audiobook' },
      ],
    };
    expect(isBookFullyAvailable(work, true, true)).toBe(true);
  });

  it('returns false when both formats enabled but only ebook completed', () => {
    const work = {
      requests: [{ status: RequestStatus.COMPLETED, format: 'ebook' }],
    };
    expect(isBookFullyAvailable(work, true, true)).toBe(false);
  });

  it('returns false when both formats enabled but only audiobook completed', () => {
    const work = {
      requests: [{ status: RequestStatus.COMPLETED, format: 'audiobook' }],
    };
    expect(isBookFullyAvailable(work, true, true)).toBe(false);
  });

  it('ignores non-completed requests', () => {
    const work = {
      requests: [
        { status: RequestStatus.PENDING, format: 'ebook' },
        { status: RequestStatus.APPROVED, format: 'audiobook' },
      ],
    };
    expect(isBookFullyAvailable(work, true, true)).toBe(false);
  });

  it('ignores declined and failed requests', () => {
    const work = {
      requests: [
        { status: RequestStatus.DECLINED, format: 'ebook' },
        { status: RequestStatus.FAILED, format: 'audiobook' },
      ],
    };
    expect(isBookFullyAvailable(work, true, true)).toBe(false);
  });

  it('handles work with undefined requests property', () => {
    expect(isBookFullyAvailable({}, true, false)).toBe(false);
  });
});

describe('isMusicFullyAvailable', () => {
  it('returns false for null album', () => {
    expect(isMusicFullyAvailable(null)).toBe(false);
  });

  it('returns false for undefined album', () => {
    expect(isMusicFullyAvailable(undefined)).toBe(false);
  });

  it('returns false when no requests', () => {
    expect(isMusicFullyAvailable({ requests: [] })).toBe(false);
  });

  it('returns false when only pending requests', () => {
    const album = { requests: [{ status: RequestStatus.PENDING }] };
    expect(isMusicFullyAvailable(album)).toBe(false);
  });

  it('returns true when a completed request exists', () => {
    const album = { requests: [{ status: RequestStatus.COMPLETED }] };
    expect(isMusicFullyAvailable(album)).toBe(true);
  });

  it('returns true when completed request among others', () => {
    const album = {
      requests: [
        { status: RequestStatus.PENDING },
        { status: RequestStatus.COMPLETED },
      ],
    };
    expect(isMusicFullyAvailable(album)).toBe(true);
  });

  it('returns false when only failed requests', () => {
    const album = { requests: [{ status: RequestStatus.FAILED }] };
    expect(isMusicFullyAvailable(album)).toBe(false);
  });

  it('handles album with undefined requests property', () => {
    expect(isMusicFullyAvailable({})).toBe(false);
  });
});
