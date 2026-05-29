export interface PairedFile {
  image: File;
  caption?: string;
  filenameStem: string;
}

export interface UploadResult {
  uploadedCount: number;
  failedCount: number;
  failed: { filename: string; error: string }[];
}
