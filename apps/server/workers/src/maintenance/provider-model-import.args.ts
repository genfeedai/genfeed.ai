import { ModelProvider } from '@genfeedai/contracts';

export interface ProviderModelImportArgs {
  databaseTarget?: string;
  endpoints: string[];
  live: boolean;
  output: string;
  provider?: ModelProvider.REPLICATE | ModelProvider.FAL;
}

export function parseProviderModelImportArgs(
  argv: string[],
): ProviderModelImportArgs {
  const options: ProviderModelImportArgs = {
    endpoints: [],
    live: false,
    output: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--live') {
      options.live = true;
      continue;
    }
    if (
      !['--output', '--provider', '--model', '--database-target'].includes(
        flag ?? '',
      )
    )
      throw new Error('unknown_import_argument');
    const value = argv[++i];
    if (!value || value.startsWith('--'))
      throw new Error('missing_import_argument_value');
    if (flag === '--output') options.output = value;
    if (flag === '--model') options.endpoints.push(value);
    if (flag === '--database-target') options.databaseTarget = value;
    if (flag === '--provider') {
      if (value !== ModelProvider.REPLICATE && value !== ModelProvider.FAL)
        throw new Error('invalid_import_provider');
      options.provider = value;
    }
  }
  if (!options.output) throw new Error('import_requires_output_path');
  if (options.live && !options.databaseTarget)
    throw new Error('live_import_requires_explicit_database_target');
  if (!options.live && options.databaseTarget)
    throw new Error('database_target_requires_live_import');
  return options;
}
