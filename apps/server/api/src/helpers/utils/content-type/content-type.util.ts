import path from 'node:path';

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.3gp': 'video/3gpp',
  '.7z': 'application/x-7z-compressed',
  '.aac': 'audio/aac',
  '.avi': 'video/x-msvideo',
  '.bmp': 'image/bmp',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.flac': 'audio/flac',
  '.flv': 'video/x-flv',
  '.gif': 'image/gif',
  '.gz': 'application/gzip',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  // Images
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',

  // Audio
  '.mp3': 'audio/mpeg',

  // Videos
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',

  // Documents
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.rar': 'application/x-rar-compressed',
  '.svg': 'image/svg+xml',
  '.tar': 'application/x-tar',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.ts': 'application/typescript',

  // Text
  '.txt': 'text/plain',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.wma': 'audio/x-ms-wma',
  '.wmv': 'video/x-ms-wmv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',

  // Archives
  '.zip': 'application/zip',
};
export const ContentTypeUtil = {
  /**
   * Get content type from file path or extension
   */
  getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
  },

  /**
   * Check if file is an image
   */
  isImage(filePath: string): boolean {
    const contentType = ContentTypeUtil.getContentType(filePath);
    return contentType.startsWith('image/');
  },

  /**
   * Check if file is a video
   */
  isVideo(filePath: string): boolean {
    const contentType = ContentTypeUtil.getContentType(filePath);
    return contentType.startsWith('video/');
  },

  /**
   * Check if file is an audio file
   */
  isAudio(filePath: string): boolean {
    const contentType = ContentTypeUtil.getContentType(filePath);
    return contentType.startsWith('audio/');
  },

  /**
   * Check if file is a document
   */
  isDocument(filePath: string): boolean {
    const contentType = ContentTypeUtil.getContentType(filePath);
    return [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ].includes(contentType);
  },

  /**
   * Get file category based on content type
   */
  getFileCategory(
    filePath: string,
  ): 'image' | 'video' | 'audio' | 'document' | 'text' | 'archive' | 'other' {
    const contentType = ContentTypeUtil.getContentType(filePath);

    if (contentType.startsWith('image/')) {
      return 'image';
    }
    if (contentType.startsWith('video/')) {
      return 'video';
    }
    if (contentType.startsWith('audio/')) {
      return 'audio';
    }
    if (contentType.startsWith('text/')) {
      return 'text';
    }
    if (ContentTypeUtil.isDocument(filePath)) {
      return 'document';
    }
    if (
      [
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        'application/x-tar',
        'application/gzip',
      ].includes(contentType)
    ) {
      return 'archive';
    }

    return 'other';
  },

  /**
   * Get recommended file extension for a content type
   */
  getExtensionForContentType(contentType: string): string | null {
    const entry = Object.entries(CONTENT_TYPE_MAP).find(
      ([, type]) => type === contentType,
    );
    return entry ? entry[0] : null;
  },

  /**
   * Validate file extension against allowed types
   */
  isAllowedExtension(filePath: string, allowedExtensions: string[]): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return allowedExtensions.map((e) => e.toLowerCase()).includes(ext);
  },
};
