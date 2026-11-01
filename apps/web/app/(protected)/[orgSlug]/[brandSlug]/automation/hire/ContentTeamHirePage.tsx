import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Container from '@ui/layout/container/Container';
import { EmptyState } from '@ui/primitives/empty-state';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { buildRoleStrategyInput } from '@/features/agents/content-team/content-team-presets';
import type { ContentTeamHirePageProps } from '@/features/automation/props/content-team-hire-page.props';
import AgentMarketplace from './AgentMarketplace';
import AgentMarketplaceSearch from './AgentMarketplaceSearch';
import { ALL_CATEGORY } from './agent-marketplace-filter';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORY);
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

  const search = (
    <AgentMarketplaceSearch
      category={category}
      onCategoryChange={setCategory}
      onSearchQueryChange={setSearchQuery}
      searchQuery={searchQuery}
    />
  );

  const content =
    !isBrandReady || !brandId ? (
      <EmptyState
        title={translate(pageScope === 'org' ? 'selectBrand' : 'loadingBrand')}
      />
    ) : (
      <AgentMarketplace
        category={category}
        isSubmitting={isSubmitting}
        onActivate={handleActivate}
        searchQuery={searchQuery}
        submittingPresetId={submittingPresetId}
      />
    );

  // Embedded in a dialog there is no subbar, so the same search field heads it.
  if (isEmbedded) {
    return (
      <div className="flex flex-col gap-6">
        {isBrandReady && brandId ? search : null}
        {content}
      </div>
    );
  }

  return (
    <Container
      icon={UserPlus}
      label={translate('title')}
      leading={isBrandReady && brandId ? search : undefined}
    >
      {content}
    </Container>
  );
}
