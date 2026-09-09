import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { buildRoleStrategyInput } from '@pages/agents/content-team/content-team-presets';
import type { ContentTeamHirePageProps } from '@props/automation/content-team-hire-page.props';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Container from '@ui/layout/container/Container';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import AgentMarketplace from './AgentMarketplace';

export default function ContentTeamHirePage({
  isEmbedded = false,
  onCreated,
}: ContentTeamHirePageProps) {
  const translate = useTranslations('common.automation.agentCreation');
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const collectionScope = useCollectionScope();
  const { brandId, pageScope } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const [submittingPresetId, setSubmittingPresetId] = useState<string | null>(
    null,
  );
  const isSubmitting = submittingPresetId !== null;

  const getStrategiesService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  const handleActivate = useCallback(
    async (presetId: string) => {
      if (isSubmitting) {
        return;
      }

      if (!isBrandReady || !brandId) {
        notificationsService.error(
          pageScope === 'org'
            ? 'Select a brand to hire an agent.'
            : 'Wait for the selected brand to finish loading.',
        );
        return;
      }

      setSubmittingPresetId(presetId);

      try {
        const service = await getStrategiesService();
        await service.create({
          ...buildRoleStrategyInput({
            brandId,
            rolePresetId: presetId,
          }),
          isActive: true,
        });

        notificationsService.success('Agent added successfully');
        if (onCreated) {
          await onCreated();
        } else {
          push(href(APP_ROUTES.AUTOMATION.AGENTS));
        }
      } catch (error) {
        logger.error('Failed to activate content team agent', { error });
        notificationsService.error('Unable to activate agent');
      } finally {
        setSubmittingPresetId(null);
      }
    },
    [
      brandId,
      getStrategiesService,
      href,
      isBrandReady,
      isSubmitting,
      notificationsService,
      onCreated,
      pageScope,
      push,
    ],
  );

  const content =
    !isBrandReady || !brandId ? (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {translate(pageScope === 'org' ? 'selectBrand' : 'loadingBrand')}
      </p>
    ) : (
      <AgentMarketplace
        isSubmitting={isSubmitting}
        onActivate={handleActivate}
        submittingPresetId={submittingPresetId}
      />
    );

  if (isEmbedded) {
    return content;
  }

  return (
    <Container
      description={translate('description')}
      icon={UserPlus}
      label={translate('title')}
    >
      {content}
    </Container>
  );
}
