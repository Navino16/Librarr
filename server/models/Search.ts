import { BookResult } from './Book';
import { AlbumResult } from './Music';

export interface SearchResult {
  type: 'book' | 'music';
  book?: BookResult;
  album?: AlbumResult;
}

export interface SearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: SearchResult[];
}
