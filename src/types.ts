export type OcrStatus = "idle" | "uploading" | "ocr_engine" | "completed" | "failed";
export type WordStatus = "idle" | "uploading" | "parsing" | "completed" | "failed";
export type MergeStatus = "idle" | "merging" | "completed" | "failed";
export type DocStatus = "idle" | "creating" | "completed" | "failed";

export interface DocumentState {
  pdfText: string;
  wordText: string;
  mergedText: string;
  pdfFileName: string;
  wordFileName: string;
}

export interface GoogleUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface GlossaryEntry {
  id: string;
  userId?: string;
  pattern: string;
  replacement: string;
  description?: string;
  createdAt: number;
}

export interface DocumentChunk {
  id: string;
  title: string;
  type: "cover" | "toc" | "chapter" | "custom";
  pdfText: string;
  wordText: string;
  mergedText: string;
  approved: boolean;
  status: "idle" | "merging" | "completed" | "failed";
}

