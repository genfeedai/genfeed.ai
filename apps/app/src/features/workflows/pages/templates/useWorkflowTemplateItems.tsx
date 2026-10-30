import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import ListRow from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type {
  CatalogSource,
  WorkflowTemplateItemActionsOptions,
} from '@/features/workflows/props/workflow-templates-page.props';
import type { SystemWorkflowCatalogEntry } from '@/features/workflows/services/workflow-api';
import WorkflowTemplateCardPreview from './WorkflowTemplateCardPreview';
import { cadenceLabel, categoryLabel } from './workflow-template-catalog';
import type { CatalogItem } from './workflow-template-types';

export function useWorkflowTemplateItems({
  copyingFeaturedWorkflowId,
  installingCanonicalId,
  copyFeaturedWorkflow,
  installSystemEntry,
  setDetailsItem,
}: WorkflowTemplateItemActionsOptions<
  CatalogItem,
  SystemWorkflowCatalogEntry
>) {
  const translate = useTranslations('pages.workflows.templates');
  function sourceLabel(source: CatalogSource): string {
    return translate(`sources.${source}`);
  }

  function factsLine(item: CatalogItem): string {
    return [
      sourceLabel(item.source),
      item.category ? categoryLabel(item.category, translate) : null,
      cadenceLabel(item.schedule, translate),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function renderPrimaryAction(item: CatalogItem) {
    const { featuredWorkflowId } = item;
    if (featuredWorkflowId) {
      const isCopying = featuredWorkflowId === copyingFeaturedWorkflowId;
      return (
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          disabled={isCopying}
          onClick={() => void copyFeaturedWorkflow(featuredWorkflowId)}
        >
          {isCopying
            ? translate('actions.copying')
            : translate('actions.useTemplate')}
        </Button>
      );
    }

    if (item.href) {
      return (
        <Button
          asChild
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          withWrapper={false}
        >
          <Link href={item.href}>{translate('actions.useTemplate')}</Link>
        </Button>
      );
    }

    const entry = item.systemEntry;
    if (!entry) {
      return null;
    }

    const isInstalling = entry.canonicalId === installingCanonicalId;
    return (
      <Button
        variant={ButtonVariant.DEFAULT}
        size={ButtonSize.SM}
        disabled={isInstalling}
        onClick={() => void installSystemEntry(entry, true)}
      >
        {isInstalling
          ? translate('actions.installing')
          : translate('actions.useTemplate')}
      </Button>
    );
  }

  function overflowActions(item: CatalogItem): CollectionOverflowAction[] {
    const actions: CollectionOverflowAction[] = [
      {
        id: 'details',
        label: translate('actions.viewDetails'),
        onSelect: () => setDetailsItem(item),
      },
    ];

    const entry = item.systemEntry;
    if (entry && !entry.installed) {
      actions.push({
        id: 'install',
        isDisabled: entry.canonicalId === installingCanonicalId,
        label: translate('actions.install'),
        onSelect: () => void installSystemEntry(entry, false),
      });
    }

    return actions;
  }

  /** The details panel's primary action when it is a command rather than a link. */
  function detailsInstallAction(
    item: CatalogItem | null,
  ): (() => void) | undefined {
    const featuredWorkflowId = item?.featuredWorkflowId;
    if (featuredWorkflowId) {
      return () => void copyFeaturedWorkflow(featuredWorkflowId);
    }
    const entry = item?.systemEntry;
    if (entry && !item?.href) {
      return () => void installSystemEntry(entry, true);
    }
    return undefined;
  }

  function renderItemActions(item: CatalogItem) {
    return (
      <CollectionItemActions
        overflow={overflowActions(item)}
        primary={renderPrimaryAction(item)}
      />
    );
  }

  function renderTemplateCard(item: CatalogItem) {
    return (
      <Card
        className="h-full"
        label={item.title}
        description={item.description}
        bodyClassName="h-full justify-between gap-4"
        data-testid="workflow-template-card"
      >
        <WorkflowTemplateCardPreview
          name={item.title}
          exampleOutput={item.exampleOutput}
          nodes={item.nodes}
          edges={item.edges}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {factsLine(item)}
          </span>
          {renderItemActions(item)}
        </div>
      </Card>
    );
  }

  function renderTemplateRow(item: CatalogItem) {
    return (
      <ListRow
        title={item.title}
        description={item.description}
        meta={factsLine(item)}
        trailing={renderItemActions(item)}
        data-testid="workflow-template-row"
      />
    );
  }

  return {
    sourceLabel,
    renderTemplateCard,
    renderTemplateRow,
    detailsInstallAction,
  };
}
