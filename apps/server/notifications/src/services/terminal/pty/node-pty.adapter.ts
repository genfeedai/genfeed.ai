import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node-pty';
import type {
  IPtyAdapter,
  IPtyHandle,
  IPtySubscription,
  PtySpawnOptions,
} from './pty-adapter.interface';

const nodeRequire = createRequire(__filename);

@Injectable()
export class NodePtyAdapter implements IPtyAdapter {
  private readonly logger = new Logger(NodePtyAdapter.name);

  ensureReady(): void {
    if (process.platform === 'win32') {
      return;
    }

    const packageDir = this.resolveNodePtyDir();
    if (!packageDir) {
      return;
    }

    const helperPath = path.join(
      packageDir,
      'prebuilds',
      `${process.platform}-${process.arch}`,
      'spawn-helper',
    );

    if (!fs.existsSync(helperPath)) {
      return;
    }

    const stat = fs.statSync(helperPath);
    if ((stat.mode & 0o111) !== 0) {
      return;
    }

    fs.chmodSync(helperPath, stat.mode | 0o755);
  }

  spawn(opts: PtySpawnOptions): IPtyHandle {
    const pty = spawn(opts.command, opts.args, {
      cols: opts.cols,
      cwd: opts.cwd,
      env: opts.env,
      name: opts.name,
      rows: opts.rows,
    });

    return {
      get pid() {
        return pty.pid;
      },

      kill() {
        pty.kill();
      },

      onData(handler: (data: string) => void): IPtySubscription {
        return pty.onData(handler);
      },

      onExit(
        handler: (event: { exitCode: number; signal?: number }) => void,
      ): IPtySubscription {
        return pty.onExit(handler);
      },

      resize(cols: number, rows: number): void {
        pty.resize(cols, rows);
      },

      write(data: string): void {
        pty.write(data);
      },
    };
  }

  private resolveNodePtyDir(): string | null {
    try {
      return path.dirname(nodeRequire.resolve('node-pty/package.json'));
    } catch {
      // Webpack-bundled dist may sit outside any node_modules tree that
      // contains node-pty. Fall back to known install locations.
    }

    const fallbackBases = [
      path.resolve(__dirname, '../../../notifications/node_modules'),
      path.resolve(process.cwd(), 'notifications/node_modules'),
      path.resolve(process.cwd(), 'apps/server/notifications/node_modules'),
      path.resolve(process.cwd(), 'node_modules'),
    ];

    for (const base of fallbackBases) {
      const candidate = path.join(base, 'node-pty');
      if (fs.existsSync(path.join(candidate, 'package.json'))) {
        return candidate;
      }
    }

    this.logger.warn('Could not resolve node-pty package directory');
    return null;
  }
}
