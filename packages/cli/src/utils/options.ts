import type { Command } from 'commander';
import { GenfeedError } from '@/utils/errors';

interface JsonOptions extends Record<string, unknown> {
  json?: boolean;
}

export function getCommandOptions<T extends Record<string, unknown>>(command: Command): T {
  return command.optsWithGlobals<T>();
}

export function wantsJson(command: Command): boolean {
  return Boolean(getCommandOptions<JsonOptions>(command).json);
}

export function parseInteger(value: string): number {
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new GenfeedError(`Invalid integer "${value}"`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new GenfeedError(`Invalid integer "${value}"`);
  }

  return parsed;
}

export function parsePositiveInteger(value: string): number {
  let parsed: number;
  try {
    parsed = parseInteger(value);
  } catch {
    throw new GenfeedError(`Invalid positive integer "${value}"`);
  }

  if (parsed < 1) throw new GenfeedError(`Invalid positive integer "${value}"`);
  return parsed;
}

export function parseIntegerInRange(value: string, minimum: number, maximum: number): number {
  const parsed = parseInteger(value);
  if (parsed < minimum || parsed > maximum) {
    throw new GenfeedError(`Integer must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}
