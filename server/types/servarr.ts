export interface ServarrProfile {
  id: number;
  name: string;
}

export interface ServarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export interface ServarrTag {
  id: number;
  label: string;
}

export interface ServarrQueueItem {
  id: number;
  title: string;
  status: string;
  size: number;
  sizeleft: number;
  timeleft?: string;
  bookId?: number;
  albumId?: number;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
}

export interface ReadarrBook {
  id: number;
  title: string;
  authorTitle?: string;
  overview?: string;
  isbn?: string;
  asin?: string;
  foreignBookId: string;
  monitored: boolean;
  grabbed: boolean;
  added: string;
  statistics?: {
    bookFileCount: number;
    totalBookCount: number;
    percentOfBooks: number;
  };
}

export interface ReadarrAuthor {
  id: number;
  authorName: string;
  foreignAuthorId: string;
  monitored: boolean;
}

export interface ReadarrAddOptions {
  title: string;
  foreignBookId: string;
  foreignEditionId?: string;
  qualityProfileId: number;
  metadataProfileId?: number;
  rootFolderPath: string;
  tags?: number[];
  monitored: boolean;
  anyEditionOk?: boolean;
  editions?: Array<{ foreignEditionId: string; title: string; monitored: boolean }>;
  addOptions: {
    addType: string;
    searchForNewBook: boolean;
  };
  author: {
    foreignAuthorId: string;
    qualityProfileId: number;
    metadataProfileId?: number;
    rootFolderPath: string;
    tags?: number[];
    monitored: boolean;
  };
}

export interface LidarrAlbum {
  id: number;
  title: string;
  foreignAlbumId: string;
  monitored: boolean;
  grabbed: boolean;
  added: string;
  albumType?: string;
  statistics?: {
    trackFileCount: number;
    trackCount: number;
    percentOfTracks: number;
  };
  artist?: LidarrArtist;
}

export interface LidarrArtist {
  id: number;
  artistName: string;
  foreignArtistId: string;
  monitored: boolean;
}

export interface LidarrAddOptions {
  title: string;
  foreignAlbumId: string;
  qualityProfileId: number;
  metadataProfileId?: number;
  rootFolderPath: string;
  monitored: boolean;
  addOptions: {
    searchForNewAlbum: boolean;
  };
  artist: {
    foreignArtistId: string;
    qualityProfileId: number;
    metadataProfileId?: number;
    rootFolderPath: string;
    monitored: boolean;
  };
}
