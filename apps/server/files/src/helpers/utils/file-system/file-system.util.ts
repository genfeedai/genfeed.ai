import * as fs from 'node:fs';
import path from 'node:path';

export class FileSystemUtil {
  static async ensureDir(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async getFileSize(filePath: string): Promise<number> {
    const stats = await fs.promises.stat(filePath);
    return stats.size;
  }

  static readFile(
    filePath: string,
    encoding: BufferEncoding = 'utf8',
  ): Promise<string> {
    return fs.promises.readFile(filePath, encoding);
  }

  static async writeFile(
    filePath: string,
    data: string | Buffer,
  ): Promise<void> {
    await FileSystemUtil.ensureDir(path.dirname(filePath));
    await fs.promises.writeFile(filePath, data);
  }

  static async deleteFile(filePath: string): Promise<void> {
    if (await FileSystemUtil.exists(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  static async listFiles(
    dirPath: string,
    extension?: string,
  ): Promise<string[]> {
    const files = await fs.promises.readdir(dirPath);
    if (extension) {
      return files.filter((file) => file.endsWith(extension));
    }
    return files;
  }

  static async copyFile(src: string, dest: string): Promise<void> {
    await FileSystemUtil.ensureDir(path.dirname(dest));
    await fs.promises.copyFile(src, dest);
  }

  static async moveFile(src: string, dest: string): Promise<void> {
    await FileSystemUtil.ensureDir(path.dirname(dest));
    await fs.promises.rename(src, dest);
  }

  static async cleanupFile(filePath: string): Promise<void> {
    try {
      if (await FileSystemUtil.exists(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {
      // Silently fail if file doesn't exist or can't be deleted
    }
  }
}
