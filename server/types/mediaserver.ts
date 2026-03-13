// Audiobookshelf types

export interface AudiobookshelfLibrary {
  id: string;
  name: string;
  mediaType: string;
}

export interface AudiobookshelfMetadata {
  title?: string;
  subtitle?: string;
  isbn?: string;
  asin?: string;
  authors?: Array<{ id: string; name: string }>;
  narrators?: Array<{ id: string; name: string }>;
  description?: string;
  publishedYear?: string;
  publishedDate?: string;
  publisher?: string;
  language?: string;
  genres?: string[];
  series?: Array<{ id: string; name: string; sequence?: string }>;
}

export interface AudiobookshelfEbookFile {
  ino: string;
  metadata: {
    filename: string;
    ext: string;
    path: string;
  };
  ebookFormat?: string;
  addedAt?: number;
  updatedAt?: number;
}

export interface AudiobookshelfLibraryItem {
  id: string;
  ino?: string;
  mediaType?: string;
  media?: {
    metadata?: AudiobookshelfMetadata;
    coverPath?: string;
    numAudioFiles?: number;
    duration?: number;
    ebookFile?: AudiobookshelfEbookFile;
    size?: number;
  };
}

// Jellyfin types

export interface JellyfinAuthResponse {
  User: {
    Id: string;
    Name: string;
    Policy: {
      IsAdministrator: boolean;
    };
  };
  AccessToken: string;
}

export interface JellyfinUser {
  Id: string;
  Name: string;
  Policy: {
    IsAdministrator: boolean;
  };
  PrimaryImageTag?: string;
}

export interface JellyfinLibrary {
  ItemId: string;
  Name: string;
  CollectionType?: string;
}

export interface JellyfinLibraryItem {
  Id: string;
  Name: string;
  ProviderIds?: {
    MusicBrainzAlbum?: string;
    MusicBrainzReleaseGroup?: string;
    Isbn?: string;
    GoodReads?: string;
  };
}

// Plex types

export interface PlexLibrary {
  key: string;
  title: string;
  type: string;
}

export interface PlexItem {
  ratingKey: string;
  title: string;
  Guid?: Array<{ id: string }>;
}
