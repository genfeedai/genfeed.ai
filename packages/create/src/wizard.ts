import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createCancellation, type InstallationLifecycle } from './lifecycle.js';
import { resolveSetupEnvironment } from './setup.js';

async function ask(
  question: string,
  secret: boolean,
  cancellation: InstallationLifecycle,
): Promise<string> {
  cancellation.signal.throwIfAborted();
  process.stdout.write(question);
  const output = secret
    ? new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
      })
    : process.stdout;
  const reader = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  let isFinished = false;
  reader.once('SIGINT', () => cancellation.interrupt('SIGINT'));
  reader.once('close', () => {
    if (!isFinished)
      cancellation.abort(new Error('Installation input closed.'));
  });
  try {
    return await reader.question('', { signal: cancellation.signal });
  } catch (error) {
    throw cancellation.signal.aborted ? cancellation.signal.reason : error;
  } finally {
    isFinished = true;
    reader.close();
    if (secret) process.stdout.write('\n');
  }
}

export async function configureEnvironment(
  template: string,
  yes = false,
  cancellation: InstallationLifecycle = createCancellation(),
): Promise<{ content: string; appUrl: string }> {
  cancellation.signal.throwIfAborted();
  const input = { ...process.env };
  if (!yes && process.stdin.isTTY) {
    input.OPENROUTER_API_KEY ||= await ask(
      'OpenRouter API key (hidden): ',
      true,
      cancellation,
    );
    if (input.SELFHOSTED_DOMAIN === undefined)
      input.SELFHOSTED_DOMAIN = await ask(
        'Domain you own (blank for localhost): ',
        false,
        cancellation,
      );
  } else if (!yes) {
    throw new Error(
      'Non-interactive installation requires --yes and OPENROUTER_API_KEY; SELFHOSTED_DOMAIN is optional.',
    );
  }
  const resolved = resolveSetupEnvironment(input);
  const environment = {
    ...resolved,
    OPENROUTER_API_KEY: input.OPENROUTER_API_KEY?.trim() ?? '',
    BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
    TOKEN_ENCRYPTION_KEY: randomBytes(16).toString('hex'),
    SELFHOSTED_APP_PORT: input.SELFHOSTED_APP_PORT || '3000',
    SELFHOSTED_API_PORT: input.SELFHOSTED_API_PORT || '3010',
    SELFHOSTED_MCP_PORT: input.SELFHOSTED_MCP_PORT || '3014',
  };
  const names = new Set(Object.keys(environment));
  const retained = template
    .split('\n')
    .filter((line) => !names.has(line.split('=')[0]))
    .join('\n');
  const lines = Object.entries(environment).map(
    ([name, value]) => `${name}='${value.replaceAll("'", "'\\''")}'`,
  );
  return {
    content: `${retained.trimEnd()}\n${lines.join('\n')}\n`,
    appUrl: resolved.GENFEEDAI_PUBLIC_URL,
  };
}
