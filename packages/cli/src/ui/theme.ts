import chalk from 'chalk';

export const colors = {
  bold: chalk.bold,
  dim: chalk.dim,
  error: chalk.hex('#DC2626'),
  info: chalk.hex('#3B82F6'),
  primary: chalk.hex('#2563EB'),
  success: chalk.hex('#10B981'),
  warning: chalk.hex('#F59E0B'),
};

export const symbols = {
  arrow: chalk.dim('→'),
  bullet: chalk.dim('•'),
  error: colors.error('✖'),
  info: colors.info('ℹ'),
  success: colors.success('✓'),
  warning: colors.warning('⚠'),
};

export function formatSuccess(message: string): string {
  return `${symbols.success} ${message}`;
}

export function formatError(message: string): string {
  return `${symbols.error} ${message}`;
}

export function formatWarning(message: string): string {
  return `${symbols.warning} ${message}`;
}

export function formatInfo(message: string): string {
  return `${symbols.info} ${message}`;
}

export function formatLabel(label: string, value: string): string {
  return `  ${colors.dim(`${label}:`)} ${value}`;
}

export function formatHeader(text: string): string {
  return colors.bold(text);
}

/** Standard CLI output — replaces console.log */
export function print(message = ''): void {
  process.stdout.write(`${message}\n`);
}

/** JSON output for --json flag */
export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}
