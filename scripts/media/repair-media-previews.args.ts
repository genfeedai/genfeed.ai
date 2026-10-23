const DEFAULT_LIMIT = 500;
const DEFAULT_SAMPLE = 10;
const FLAGS = ['--apply', '--limit', '--organization', '--sample'];

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
  const organizationId = read('--organization');
  if (
    argv.includes('--organization') &&
    (!organizationId?.trim() || FLAGS.includes(organizationId))
  ) {
    throw new Error('--organization needs an organization id');
  }
  return {
    isApply: argv.includes('--apply'),
    limit: positiveInteger(read('--limit'), DEFAULT_LIMIT),
    organizationId: organizationId ?? null,
    sample: positiveInteger(read('--sample'), DEFAULT_SAMPLE),
  };
}
