export interface IUploadResponseData {
  id: string;
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

export interface IBatchResponse<T> {
  successful: T[];
  failed: Array<{
    item: Partial<T>;
    error: string;
  }>;
  total: number;
}
