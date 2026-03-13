export interface EnrichedMedia {
  id: number;
  status: number;
  ebookAvailable?: boolean;
  audiobookAvailable?: boolean;
  requests: { id: number; status: number; format?: string; requestedFormat?: string }[];
}
