const DEFAULT_LIMIT = 500;
const DEFAULT_SAMPLE = 10;

export type RepairOptions = {
  isApply: boolean;
  limit: number;
  organizationId: string | null;
  sample: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseArgs(argv: readonly string[]): RepairOptions {
  const read = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    isApply: argv.includes('--apply'),
    limit: positiveInteger(read('--limit'), DEFAULT_LIMIT),
    organizationId: read('--organization') ?? null,
    sample: positiveInteger(read('--sample'), DEFAULT_SAMPLE),
  };
}
