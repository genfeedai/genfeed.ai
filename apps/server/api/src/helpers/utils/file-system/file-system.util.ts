import { promises as fs } from 'node:fs';
import path from 'node:path';

export class FileSystemUtil {
  /**
   * Create a temporary file with the provided content
   */
  static async createTempFile(
    key: string,
    body: Buffer,
    extension: string,
  ): Promise<string> {
    // Ensure the tmp directory exists
    const tmpDir = path.resolve('public', 'tmp');

    try {
      await fs.access(tmpDir);
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(tmpDir, { recursive: true });
    }

    const tmpPath = path.resolve(tmpDir, `${key}.${extension}`);
    await fs.writeFile(tmpPath, body);
    return tmpPath;
  }

  /**
   * Clean up a file by deleting it
   */
  static async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // Silently ignore cleanup errors to avoid breaking the main flow
    }
  }

  /**
   * Clean up multiple files
   */
  static async cleanupFiles(filePaths: string[]): Promise<void> {
    await Promise.allSettled(
      filePaths.map((filePath) => FileSystemUtil.cleanupFile(filePath)),
    );
  }

  /**
   * Check if a file exists
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file size in bytes
   */
  static async getFileSize(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  /**
   * Ensure directory exists, create if it doesn't
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Create a unique temporary filename
   */
  static generateTempFileName(extension: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `temp_${timestamp}_${random}.${extension}`;
  }
}
