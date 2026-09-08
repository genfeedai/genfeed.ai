import type {
  HelpDestinationConfig,
  HelpResource,
} from '@props/settings/help-content.props';
import { EnvironmentService } from '@services/core/environment.service';

export function getHelpDestination(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function getHelpResources(
  selfHosted: boolean,
  config: HelpDestinationConfig = EnvironmentService.help,
): HelpResource[] {
  return [
    {
      id: 'gettingStarted',
      owner: 'documentation',
      url: getHelpDestination(
        selfHosted ? config.selfHostedGettingStarted : config.gettingStarted,
      ),
    },
    {
      id: 'documentation',
      owner: 'documentation',
      url: getHelpDestination(config.documentation),
    },
    {
      id: 'workflows',
      owner: 'documentation',
      url: getHelpDestination(config.workflows),
    },
    {
      id: 'changelog',
      owner: 'product',
      url: getHelpDestination(config.changelog),
    },
    { id: 'faq', owner: 'documentation', url: getHelpDestination(config.faq) },
    {
      id: 'community',
      owner: 'community',
      url: getHelpDestination(config.community),
    },
    {
      id: 'support',
      owner: selfHosted ? 'deployment-operator' : 'product',
      url: getHelpDestination(
        selfHosted ? config.selfHostedSupport : config.cloudSupport,
      ),
    },
  ];
}
