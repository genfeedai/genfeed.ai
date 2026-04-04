import { getToolsForSurface } from '@genfeedai/tools';
import { Command } from 'commander';
import { print } from '@/ui/theme.js';

export const toolsCommand = new Command('tools')
  .description('List canonical Genfeed tool names available to CLI')
  .option('--json', 'Output as JSON')
  .action((options) => {
    const tools = getToolsForSurface('cli').map((tool) => ({
      category: tool.category,
      description: tool.description,
      name: tool.name,
    }));

    if (options.json) {
      print(JSON.stringify({ tools }, null, 2));
      return;
    }

    if (tools.length === 0) {
      print('No CLI tools registered.');
      return;
    }

    for (const tool of tools) {
      print(`${tool.name} (${tool.category})`);
    }
  });
