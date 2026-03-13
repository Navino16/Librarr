import { describe, it, expect } from 'vitest';

describe('constants', () => {
  describe('languages', () => {
    it('exports an array of language codes', async () => {
      const { languageCodes } = await import('@server/constants/languages');
      expect(Array.isArray(languageCodes)).toBe(true);
      expect(languageCodes.length).toBeGreaterThan(0);
      expect(languageCodes).toContain('en');
      expect(languageCodes).toContain('fr');
    });
  });

  describe('music', () => {
    it('exports MusicAlbumStatus enum', async () => {
      const { MusicAlbumStatus } = await import('@server/constants/music');
      expect(MusicAlbumStatus.UNKNOWN).toBe(1);
      expect(MusicAlbumStatus.PENDING).toBe(2);
      expect(MusicAlbumStatus.AVAILABLE).toBe(5);
    });

    it('exports MusicAlbumType enum', async () => {
      const { MusicAlbumType } = await import('@server/constants/music');
      expect(MusicAlbumType.ALBUM).toBe('album');
      expect(MusicAlbumType.SINGLE).toBe('single');
      expect(MusicAlbumType.EP).toBe('ep');
    });
  });

  describe('user', () => {
    it('exports UserType enum', async () => {
      const { UserType } = await import('@server/constants/user');
      expect(UserType.JELLYFIN).toBe(1);
      expect(UserType.PLEX).toBe(2);
      expect(UserType.LOCAL).toBe(3);
    });
  });
});
