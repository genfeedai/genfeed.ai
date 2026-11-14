import { Command } from 'commander';
import {
  approveOrganizationBrandOs,
  type OrganizationBrandOsKit,
} from '@/operations/admin-brand-os';
import { formatHeader, formatLabel, formatSuccess, formatWarning, print } from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';

interface BrandOsApproveOptions {
  audience?: string[];
  brand: string;
  description?: string;
  doNotSoundLike?: string[];
  guidelines?: string;
  messagingPillars?: string[];
  org: string;
  sample?: string;
  style?: string;
  tone?: string;
  values?: string[];
  yes?: boolean;
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function toKit(options: BrandOsApproveOptions): OrganizationBrandOsKit {
  const kit: OrganizationBrandOsKit = {
    description: options.description,
    promptGuidelines: options.guidelines,
    voiceAudience: options.audience,
    voiceDoNotSoundLike: options.doNotSoundLike,
    voiceMessagingPillars: options.messagingPillars,
    voiceSampleOutput: options.sample,
    voiceStyle: options.style,
    voiceTone: options.tone,
    voiceValues: options.values,
  };
  return Object.fromEntries(
    Object.entries(kit).filter(([, value]) => value !== undefined)
  ) as OrganizationBrandOsKit;
}

export function createBrandOsApproveCommand(): Command {
  return new Command('os-approve')
    .description(
      'Set the voice and guidelines of a brand in any organization and approve its Brand OS (preview unless --yes)'
    )
    .requiredOption('--org <organizationId>', 'Organization id')
    .requiredOption('--brand <brandId>', 'Brand id')
    .option('--description <text>', 'Brand description')
    .option('--tone <text>', 'Voice tone')
    .option('--style <text>', 'Voice style')
    .option('--sample <text>', 'Sample output in the brand voice')
    .option('--guidelines <text>', 'Prompt guidelines')
    .option('--audience <text>', 'Audience (repeat for several)', collect)
    .option('--values <text>', 'Voice value (repeat for several)', collect)
    .option('--messaging-pillars <text>', 'Messaging pillar (repeat for several)', collect)
    .option('--do-not-sound-like <text>', 'What the voice must not sound like (repeat)', collect)
    .option('--yes', 'Apply the fields and approve the revision')
    .action(async (options: BrandOsApproveOptions) => {
      try {
        const kit = toKit(options);
        if (Object.keys(kit).length === 0) {
          throw new GenfeedError(
            'Pass at least one kit field.',
            'Example: --tone "Bold and punchy" --style "Very short lines"'
          );
        }
        if (!options.yes) {
          print(formatHeader('Brand OS approval (preview)\n'));
          print(formatLabel('Organization', options.org));
          print(formatLabel('Brand', options.brand));
          for (const [field, value] of Object.entries(kit)) {
            print(formatLabel(field, Array.isArray(value) ? value.join(' | ') : String(value)));
          }
          print(formatWarning('Re-run with --yes to apply these fields and approve the Brand OS.'));
          return;
        }
        const result = await approveOrganizationBrandOs(options.org, options.brand, kit);
        print(
          formatSuccess(`Approved Brand OS revision ${result.revisionId} (v${result.version})`)
        );
        print(formatLabel('Status', result.status));
        print(formatLabel('Applied', result.appliedFields.join(', ') || 'none'));
      } catch (error) {
        handleError(error);
      }
    });
}
