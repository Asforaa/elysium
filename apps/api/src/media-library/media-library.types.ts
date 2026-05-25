export type MediaLibraryCategory =
  | 'anime-movie'
  | 'anime-series'
  | 'movie'
  | 'series'
  | 'unknown';

export type MediaLibraryFileKind = 'note' | 'other' | 'video';

export interface MediaLibraryScanFile {
  absolutePath: string;
  canonicalFilenameGuess?: string;
  canonicalFolderGuess?: string;
  canonicalRelativePathGuess?: string;
  category: MediaLibraryCategory;
  entityTitleGuess?: string;
  extension: string;
  fileKind: MediaLibraryFileKind;
  filename: string;
  issues: string[];
  modifiedAt: string;
  parsedEpisodeNumber?: number;
  parsedPartNumber?: number;
  parsedQuality?: string;
  parsedSeasonNumber?: number;
  parsedSource?: string;
  relativePath: string;
  sizeBytes: number;
}

export interface MediaLibraryNoteCandidate {
  absolutePath: string;
  content: string;
  kind: string;
  modifiedAt: string;
  relativePath: string;
  title: string;
}

export interface LowCountCandidate {
  category: MediaLibraryCategory;
  fileCount: number;
  title: string;
}

export interface MediaLibraryScanSummary {
  categoryCounts: Record<string, number>;
  files: MediaLibraryScanFile[];
  issueCounts: Record<string, number>;
  lowCountCandidates: LowCountCandidate[];
  notes: MediaLibraryNoteCandidate[];
  qualityCounts: Record<string, number>;
  rootPath: string;
  scannedAt: string;
  sourceCounts: Record<string, number>;
  totals: {
    bytes: number;
    notes: number;
    other: number;
    videos: number;
  };
}
