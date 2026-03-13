export interface AlbumResult {
  musicBrainzId?: string;
  spotifyId?: string;
  foreignAlbumId?: string;
  title: string;
  artists: ArtistSummary[];
  releaseDate?: string;
  coverUrl?: string;
  type?: 'album' | 'single' | 'ep' | 'compilation';
  genres?: string[];
  trackCount?: number;
  label?: string;
  popularity?: number;
}

export interface ArtistSummary {
  id?: string;
  name: string;
}

export interface ArtistResult {
  musicBrainzId: string;
  spotifyId?: string;
  name: string;
  sortName?: string;
  type?: string;
  bio?: string;
  photoUrl?: string;
  country?: string;
  beginDate?: string;
  endDate?: string;
  genres?: string[];
  topAlbums?: AlbumResult[];
}

export interface TrackResult {
  musicBrainzId?: string;
  spotifyId?: string;
  title: string;
  duration?: number;
  position?: number;
  discNumber?: number;
}
