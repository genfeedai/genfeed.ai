import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ClientService } from '@mcp/services/client.service';

export interface InstallSkillParams {
  receiptId: string;
  skillSlug?: string;
  installPath?: string;
}

interface VerifyResponse {
  valid: boolean;
  productType: 'skill' | 'bundle';
  skills: string[];
  email: string;
}

interface DownloadResponse {
  downloadUrl: string;
  expiresIn: number;
  skill: {
    slug: string;
    name: string;
    version: string;
    checksum: string;
    fileSize: number;
  };
}

interface ZipEntry {
  fileName: string;
}

interface ZipFile {
  readEntry: () => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  openReadStream: (
    entry: ZipEntry,
    callback: (
      err: Error | null,
      readStream: NodeJS.ReadableStream | null,
    ) => void,
  ) => void;
}

interface YauzlModule {
  open: (
    path: string,
    options: { lazyEntries: boolean },
    callback: (err: Error | null, zipfile: ZipFile) => void,
  ) => void;
}

function verifyChecksum(filePath: string, expected: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex') === expected));
    stream.on('error', reject);
  });
}

function validateExtractPath(destDir: string, entryPath: string): string {
  const fullPath = resolve(destDir, entryPath);
  const rel = relative(destDir, fullPath);
  if (rel.startsWith('..') || resolve(fullPath) !== fullPath) {
    throw new Error(`Zip-slip detected: ${entryPath}`);
  }
  return fullPath;
}

export function createInstallSkillTool(client: ClientService) {
  return {
    description:
      'Install a purchased premium skill. Verifies receipt, downloads skill ZIP, validates checksum, and extracts to skills directory.',

    async handler(params: InstallSkillParams) {
      const { receiptId, skillSlug, installPath } = params;

      if (!receiptId || !receiptId.startsWith('sk_rcpt_')) {
        return {
          content: [
            {
              text: JSON.stringify({
                error: 'Invalid receipt ID format. Expected sk_rcpt_...',
                success: false,
              }),
              type: 'text' as const,
            },
          ],
        };
      }

      try {
        // Step 1: Verify receipt
        const verification = await client.postAttributes<VerifyResponse>(
          '/skills-pro/verify',
          {
            data: { attributes: { receiptId } },
          },
        );

        if (!verification?.valid) {
          return {
            content: [
              {
                text: JSON.stringify({
                  error: 'Invalid or expired receipt',
                  receiptId,
                  success: false,
                }),
                type: 'text' as const,
              },
            ],
          };
        }

        // Step 2: Determine skill to download
        const targetSlug = skillSlug || verification.skills[0];
        if (!targetSlug) {
          return {
            content: [
              {
                text: JSON.stringify({
                  availableSkills: verification.skills,
                  error:
                    'No skill specified. Bundle receipts require --skillSlug.',
                  success: false,
                }),
                type: 'text' as const,
              },
            ],
          };
        }

        // Step 3: Get download URL
        const download = await client.postAttributes<DownloadResponse>(
          '/skills-pro/download',
          {
            data: {
              attributes: { receiptId, skillSlug: targetSlug },
            },
          },
        );

        if (!download?.downloadUrl) {
          return {
            content: [
              {
                text: JSON.stringify({
                  error: 'Failed to get download URL',
                  success: false,
                }),
                type: 'text' as const,
              },
            ],
          };
        }

        // Step 4: Download ZIP
        const baseDir = installPath || join(process.cwd(), 'skills');
        const skillDir = join(baseDir, download.skill.slug);
        const tmpZip = join(baseDir, `.${download.skill.slug}.zip.tmp`);

        await mkdir(baseDir, { recursive: true });

        const response = await fetch(download.downloadUrl);
        if (!response.ok || !response.body) {
          throw new Error(`Download failed: ${response.status}`);
        }

        const fileStream = createWriteStream(tmpZip);
        await pipeline(response.body, fileStream);

        // Step 5: Verify checksum
        const checksumValid = await verifyChecksum(
          tmpZip,
          download.skill.checksum,
        );
        if (!checksumValid) {
          await rm(tmpZip, { force: true });
          return {
            content: [
              {
                text: JSON.stringify({
                  error:
                    'Checksum verification failed. Download may be corrupted.',
                  success: false,
                }),
                type: 'text' as const,
              },
            ],
          };
        }

        // Step 6: Extract (using dynamic import for yauzl if available)
        await mkdir(skillDir, { recursive: true });

        try {
          const yauzlModuleName = 'yauzl';
          const yauzl = (await import(
            yauzlModuleName
          )) as unknown as YauzlModule;
          await new Promise<void>((resolvePromise, rejectPromise) => {
            yauzl.open(
              tmpZip,
              { lazyEntries: true },
              (err: Error | null, zipfile: ZipFile) => {
                if (err) {
                  return rejectPromise(err);
                }

                zipfile.readEntry();
                zipfile.on('entry', (entry: unknown) => {
                  const zipEntry = entry as ZipEntry;
                  const extractPath = validateExtractPath(
                    skillDir,
                    zipEntry.fileName,
                  );

                  if (/\/$/.test(zipEntry.fileName)) {
                    mkdir(extractPath, { recursive: true }).then(() =>
                      zipfile.readEntry(),
                    );
                  } else {
                    mkdir(join(extractPath, '..'), {
                      recursive: true,
                    }).then(() => {
                      zipfile.openReadStream(
                        zipEntry,
                        (
                          streamErr: Error | null,
                          readStream: NodeJS.ReadableStream | null,
                        ) => {
                          if (streamErr) {
                            return rejectPromise(streamErr);
                          }
                          if (!readStream) {
                            return rejectPromise(
                              new Error('Failed to open ZIP entry stream'),
                            );
                          }
                          const ws = createWriteStream(extractPath);
                          readStream.pipe(ws);
                          ws.on('close', () => zipfile.readEntry());
                          ws.on('error', rejectPromise);
                        },
                      );
                    });
                  }
                });
                zipfile.on('end', () => resolvePromise());
                zipfile.on('error', rejectPromise);
              },
            );
          });
        } catch {
          // yauzl not available - return download info instead
          await rm(tmpZip, { force: true });
          return {
            content: [
              {
                text: JSON.stringify({
                  downloadUrl: download.downloadUrl,
                  installPath: skillDir,
                  message:
                    'ZIP extraction not available in this environment. Download URL provided for manual installation.',
                  skill: download.skill,
                  success: false,
                }),
                type: 'text' as const,
              },
            ],
          };
        }

        // Cleanup temp file
        await rm(tmpZip, { force: true });

        const _stats = await stat(skillDir);

        return {
          content: [
            {
              text: JSON.stringify({
                installedAt: skillDir,
                message: `Skill "${download.skill.name}" v${download.skill.version} installed successfully.`,
                skill: {
                  name: download.skill.name,
                  slug: download.skill.slug,
                  version: download.skill.version,
                },
                success: true,
              }),
              type: 'text' as const,
            },
          ],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              text: JSON.stringify({
                error: message,
                success: false,
              }),
              type: 'text' as const,
            },
          ],
        };
      }
    },
    inputSchema: {
      properties: {
        installPath: {
          description: 'Custom install directory (default: ./skills/)',
          type: 'string',
        },
        receiptId: {
          description: 'Purchase receipt ID (sk_rcpt_...)',
          type: 'string',
        },
        skillSlug: {
          description: 'Skill slug to install (required for bundle receipts)',
          type: 'string',
        },
      },
      required: ['receiptId'],
      type: 'object' as const,
    },
    name: 'install_skill',
  };
}
