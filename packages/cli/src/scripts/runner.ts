import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface RunScriptOptions {
  script: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

interface RunScriptResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, '../../../../scripts/darkroom');

export function getScriptPath(name: string): string {
  return path.join(SCRIPTS_DIR, name);
}

export function runScript(options: RunScriptOptions): Promise<RunScriptResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = options.script.startsWith('/')
      ? options.script
      : getScriptPath(options.script);

    const child = spawn(scriptPath, options.args ?? [], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      options.onStdout?.(text);
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      options.onStderr?.(text);
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to run script ${options.script}: ${error.message}`));
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stderr: stderr.trim(),
        stdout: stdout.trim(),
      });
    });
  });
}
