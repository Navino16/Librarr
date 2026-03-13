// Shared types mirroring server models for frontend use

// Re-export constants from single source of truth
export { WorkStatus, RequestStatus, DeclineReasons } from '../constants/media';
export type { DeclineReason, WorkStatusType, RequestStatusType } from '../constants/media';
export { Permission } from '../constants/permissions';
export { hasPermission } from '../constants/permissions';

export interface AuthorSummary {
  id?: string;
  name: string;
}

export interface SeriesSummary {
  id: string;
  name: string;
  position?: number;
  booksCount?: number;
}

export interface BookResult {
  goodreadsId?: string;
  hardcoverId?: string;
  openLibraryId?: string;
  isbn?: string;
  asin?: string;
  googleBooksId?: string;
  title: string;
  authors: AuthorSummary[];
  description?: string;
  coverUrl?: string;
  publishedDate?: string;
  publisher?: string;
  pageCount?: number;
  categories?: string[];
  averageRating?: number;
  sourceUrl?: string;
  editionFormat?: string;
  hasEbookEdition?: boolean;
  hasAudiobookEdition?: boolean;
  allEditionIdentifiers?: string[];
  /** Enriched local Work data from enrichBookResults */
  media?: WorkLocalSummary;
  series?: SeriesSummary;
}

export interface ArtistSummary {
  id?: string;
  name: string;
}

export interface AlbumResult {
  musicBrainzId?: string;
  spotifyId?: string;
  title: string;
  artists: ArtistSummary[];
  releaseDate?: string;
  coverUrl?: string;
  type?: 'album' | 'single' | 'ep' | 'compilation';
  genres?: string[];
  trackCount?: number;
  label?: string;
  /** Local MusicAlbum data when this album exists in the DB */
  media?: MusicAlbumLocalSummary;
}

export interface TrackResult {
  musicBrainzId?: string;
  title: string;
  duration?: number;
  position?: number;
}

export interface AuthorResult {
  goodreadsId?: string;
  openLibraryId?: string;
  name: string;
  bio?: string;
  photoUrl?: string;
  birthDate?: string;
  deathDate?: string;
  sourceUrl?: string;
}

export interface ArtistResult {
  musicBrainzId: string;
  name: string;
  type?: string;
  bio?: string;
  photoUrl?: string;
  country?: string;
  beginDate?: string;
  genres?: string[];
}

/** Book result from search API (uses `work` instead of `media` for local data) */
export interface SearchBookResult {
  hardcoverId?: string;
  openLibraryWorkId?: string;
  title: string;
  originalTitle?: string;
  description?: string;
  coverUrl?: string;
  publishedDate?: string;
  pageCount?: number;
  averageRating?: number;
  sourceUrl?: string;
  authors?: Array<{ name: string; hardcoverId?: string }>;
  series?: { name: string; hardcoverId?: string; position?: number };
  genres?: string[];
  source?: string;
  /** Local Work data (enriched by the server) */
  work?: WorkLocalSummary;
}

export interface SearchResult {
  type: 'book' | 'music';
  book?: SearchBookResult;
  album?: AlbumResult;
}

export interface SearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: SearchResult[];
}

export interface PaginatedResponse<T> {
  pageInfo: { pages: number; page: number; results: number };
  results: T[];
}

export interface UnmatchedMediaItem {
  id: number;
  sourceItemId: string;
  source: string;
  title: string;
  authors?: string;
  isbn?: string;
  asin?: string;
  format: string;
  libraryName?: string;
  sourceUrl?: string;
  reason: string;
  firstSeenAt: string;
  lastAttemptedAt: string;
}

/** Response item from GET /api/v1/discover/recent (new Work-centric format) */
export interface RecentRequestItem {
  type: 'book';
  work: {
    id: number;
    hardcoverId: string;
    title: string;
    coverUrl?: string;
    status: number;
    ebookAvailable: boolean;
    audiobookAvailable: boolean;
    authors?: Array<{ author: { hardcoverId: string; name: string } }>;
  };
  request: {
    id: number;
    format: string;
    status: number;
    requestedBy?: { id: number; username: string };
    createdAt: string;
  };
  requests: Array<{
    id: number;
    format: string;
    status: number;
  }>;
}

/**
 * Work local data as returned by enrichBookResults in discover/search/author APIs.
 * This represents the "media" field attached to BookResult.
 */
export interface WorkLocalSummary {
  id: number;
  status: number;
  ebookAvailable?: boolean;
  audiobookAvailable?: boolean;
  hasEbookEdition?: boolean;
  hasAudiobookEdition?: boolean;
  requests?: WorkRequestSummary[];
}

/** Request summary as returned in enriched Work data (format-based) */
export interface WorkRequestSummary {
  id: number;
  status: number;
  format: string; // 'ebook' | 'audiobook'
  requestedBy?: { id: number; username: string };
  createdAt?: string;
}

/** Local MusicAlbum data as returned by the music detail/search API */
export interface MusicAlbumLocalSummary {
  id: number;
  status: number;
  musicBrainzId?: string;
  requests?: MusicRequestLocalSummary[];
}

/** Music request summary as attached to MusicAlbumLocalSummary */
export interface MusicRequestLocalSummary {
  id: number;
  status: number;
  requestedBy?: { id: number; username: string };
  downloadProgress?: number;
  downloadStatus?: string;
  downloadTimeLeft?: string;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Request list types (matching GET /api/v1/request response)
// ---------------------------------------------------------------------------

/** Work summary as returned in book request list responses */
export interface WorkSummary {
  id: number;
  hardcoverId: string;
  title: string;
  coverUrl?: string;
}

/** Music album summary as returned in music request list responses */
export interface MusicAlbumSummary {
  id: number;
  musicBrainzId: string;
  title: string;
  coverUrl?: string;
  artistName?: string;
}

/** Book request as returned by GET /api/v1/request */
export interface BookRequestItem {
  id: number;
  type: 'book';
  status: number;
  format: string; // 'ebook' | 'audiobook'
  requestedLanguage?: string;
  work: WorkSummary;
  requestedBy?: UserSummary;
  modifiedBy?: UserSummary;
  declineReason?: string;
  downloadProgress?: number;
  downloadStatus?: string;
  downloadTimeLeft?: string;
  isAutoRequest: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Music request as returned by GET /api/v1/request */
export interface MusicRequestItem {
  id: number;
  type: 'music';
  status: number;
  album: MusicAlbumSummary;
  requestedBy?: UserSummary;
  modifiedBy?: UserSummary;
  declineReason?: string;
  downloadProgress?: number;
  downloadStatus?: string;
  downloadTimeLeft?: string;
  isAutoRequest: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Union type for request list items */
export type RequestListItem = BookRequestItem | MusicRequestItem;

/** Response from GET /api/v1/request/count */
export interface RequestCountResponse {
  pending: number;
  approved: number;
  declined: number;
  completed: number;
  failed: number;
}

export interface UserSummary {
  id: number;
  username: string;
  email?: string;
  avatar?: string;
  userType: number;
  permissions: number;
  createdAt: string;
  requestCount?: number;
}

export interface IssueSummary {
  id: number;
  issueType: number;
  status: number;
  work?: WorkSummary;
  musicAlbum?: MusicAlbumSummary;
  createdBy?: UserSummary;
  createdAt: string;
}

export interface IssueComment {
  id: number;
  message: string;
  user: UserSummary;
  createdAt: string;
}

export interface IssueDetail extends IssueSummary {
  modifiedBy?: UserSummary;
  comments: IssueComment[];
  updatedAt: string;
}

export interface JobInfo {
  id: string;
  name: string;
  schedule: string;
  nextRun?: string;
  running: boolean;
}

export interface ServarrServer {
  id: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  apiKeySet?: boolean;
  useSsl: boolean;
  baseUrl?: string;
  activeProfileId: number;
  activeDirectory: string;
  metadataProfileId?: number;
  tags?: number[];
  contentType?: 'ebook' | 'audiobook';
}

export interface PermissionRole {
  id: number;
  name: string;
  permissions: number;
  isDefault: boolean;
  ebookQuotaLimit?: number;
  audiobookQuotaLimit?: number;
  musicQuotaLimit?: number;
}

// ---------------------------------------------------------------------------
// Quota types
// ---------------------------------------------------------------------------

export interface QuotaInfo {
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface UserQuotaResponse {
  ebook: QuotaInfo;
  audiobook: QuotaInfo;
  music: QuotaInfo;
}

// ---------------------------------------------------------------------------
// Work-centric types (matching server entities)
// ---------------------------------------------------------------------------

export interface WorkAuthorDetail {
  id: number;
  role?: string;
  author: {
    id: number;
    hardcoverId: string;
    name: string;
    photoUrl?: string;
    sourceUrl?: string;
  };
}

export interface WorkAvailabilityDetail {
  id: number;
  format: string; // 'ebook' | 'audiobook'
  source: string; // 'audiobookshelf' | 'jellyfin' | 'plex'
  sourceItemId?: string;
  sourceUrl?: string;
  addedAt: string;
  lastVerifiedAt?: string;
}

export interface EditionDetail {
  id: number;
  isbn13?: string;
  isbn10?: string;
  asin?: string;
  title?: string;
  publisher?: string;
  publishedDate?: string;
  language?: string;
  pageCount?: number;
  coverUrl?: string;
  format: string; // 'ebook' | 'audiobook'
  source?: string;
}

export interface BookRequestDetail {
  id: number;
  format: string; // 'ebook' | 'audiobook'
  status: number;
  requestedLanguage?: string;
  requestedBy?: UserSummary;
  modifiedBy?: UserSummary;
  downloadProgress?: number;
  downloadStatus?: string;
  downloadTimeLeft?: string;
  declineReason?: string;
  isAutoRequest: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesDetail {
  id: number;
  hardcoverId: string;
  name: string;
  booksCount?: number;
}

export interface WorkDetail {
  id: number;
  hardcoverId: string;
  openLibraryWorkId?: string;
  title: string;
  originalTitle?: string;
  description?: string;
  coverUrl?: string;
  publishedDate?: string;
  pageCount?: number;
  averageRating?: number;
  ratingsCount?: number;
  sourceUrl?: string;
  genresJson?: string;
  status: number;
  ebookAvailable: boolean;
  audiobookAvailable: boolean;
  hasEbookEdition: boolean;
  hasAudiobookEdition: boolean;
  metadataSource?: string;
  authors: WorkAuthorDetail[];
  editions: EditionDetail[];
  availability: WorkAvailabilityDetail[];
  series?: SeriesDetail;
  seriesPosition?: number;
  requests: BookRequestDetail[];
  createdAt: string;
  updatedAt: string;
}

/** Response from GET /api/v1/book/lookup/:hardcoverId */
export interface BookLookupResponse {
  metadata: BookResult | null;
  work: WorkDetail | null;
}
