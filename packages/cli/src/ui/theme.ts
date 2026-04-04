import chalk from 'chalk';

export const colors = {
  bold: chalk.bold,
  dim: chalk.dim,
  error: chalk.red,
  info: chalk.blue,
  primary: chalk.hex('#7C3AED'),
  success: chalk.green,
  warning: chalk.yellow,
};

export const symbols = {
  arrow: chalk.dim('→'),
  bullet: chalk.dim('•'),
  error: chalk.red('✖'),
  info: chalk.blue('ℹ'),
  success: chalk.green('✓'),
  warning: chalk.yellow('⚠'),
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
