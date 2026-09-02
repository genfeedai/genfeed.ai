'use client';

import { ButtonSize, ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { Button } from '@ui/primitives/button';
import {
  Eye,
  File,
  Globe,
  LayoutGrid,
  Maximize2,
  MessageSquare,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { MutableRefObject, ReactNode } from 'react';

import type { AnalyticsWorkspaceSurfaceAdapterState } from '@/features/analytics/work-surface/analytics-workspace-surface-adapter-context';
import type { ResearchWorkspaceSurfaceAdapterRegistration } from '@/features/research/work-surface/research-workspace-surface-adapter-context';
import { WorkflowSurfaceInspector } from '@/features/workflows/workspace/WorkflowSurfaceInspector';
import { WORKSPACE_INSPECTOR_CHROME } from '@/lib/workspace-shell/workspace-inspector-chrome';
import type { WorkspaceInspectorAssetKind } from '@/lib/workspace-shell/workspace-inspector-panes.util';
import type { WorkspaceShellPendingTransition } from '@/lib/workspace-shell/workspace-shell-transition.util';

import WorkspaceInspectorBrowserPane from './WorkspaceInspectorBrowserPane';
import WorkspaceInspectorFilesPane from './WorkspaceInspectorFilesPane';
import type {
  ActiveWorkspaceSurfaceAdapter,
  ProductWorkspaceSurfaceAdapter,
  WorkspaceSurfacePresentationAdapter,
} from './WorkspaceSurfaceAdapterContext';
import {
  inspectorContextPaneClassName,
  isAgentOwnedInspector,
  isInspectorComposerOwner,
  resolveWorkspaceInspectorBodyKind,
  resolveWorkspaceInspectorPaneKind,
  shouldShowInspectorOverlayPreview,
  type WorkspaceInspectorBodyKind,
  type WorkspaceInspectorPaneKind,
} from './workspace-inspector-kind.util';

type WorkspaceInspectorAdapters = {
  readonly effectiveSurfaceAdapter: AnalyticsWorkspaceSurfaceAdapterState | null;
  readonly productSurfaceAdapter: ProductWorkspaceSurfaceAdapter | null;
  readonly researchSurfaceAdapter: ResearchWorkspaceSurfaceAdapterRegistration | null;
  readonly surfacePresentationAdapter: WorkspaceSurfacePresentationAdapter | null;
  readonly workspaceSurfaceAdapter: ActiveWorkspaceSurfaceAdapter | null;
};

type WorkspaceInspectorActions = {
  readonly onExpandedKindsChange: (expandedKinds: readonly string[]) => void;
  readonly onOpenOverlay: () => void;
  readonly onOpenWorkflowPicker: () => boolean;
  readonly onReturnToConversation: () => void;
  readonly onSetComposerPortalTarget: (element: HTMLElement | null) => void;
  readonly pendingTransitionRef: MutableRefObject<WorkspaceShellPendingTransition | null>;
};

type WorkspaceInspectorChromeModel = {
  readonly expandedKinds: readonly WorkspaceInspectorAssetKind[];
  readonly hasAgentInspectorPanel: boolean;
  readonly inspectorBreadcrumbLabel: string;
  readonly inspectorScope: ReactNode;
};

type WorkspaceInspectorRoute = {
  readonly activeThreadContextVersion?: number;
  readonly effectiveThreadId: string | null;
  readonly fullConversationHref: string;
  readonly isAgentRoute: boolean;
  readonly isOverlayState: boolean;
  readonly isWorkflowInspectorSurface: boolean;
  readonly rawPathname: string;
  readonly searchParamsString: string;
};

type WorkspaceInspectorContentProps = {
  readonly actions: WorkspaceInspectorActions;
  readonly adapters: WorkspaceInspectorAdapters;
  readonly agentPanelSlot?: ReactNode;
  readonly chrome: WorkspaceInspectorChromeModel;
  readonly conversationSlot?: ReactNode;
  readonly route: WorkspaceInspectorRoute;
};

type WorkspaceInspectorExpandControlProps = {
  readonly conversationSlot?: ReactNode;
  readonly fullConversationHref: string;
  readonly isAgentRoute: boolean;
  readonly pendingTransitionRef: MutableRefObject<WorkspaceShellPendingTransition | null>;
};

const INSPECTOR_PANE_ICONS: Record<
  WorkspaceInspectorAssetKind,
  typeof LayoutGrid
> = {
  browser: Globe,
  context: LayoutGrid,
  files: File,
};

type WorkspaceInspectorContextPaneProps = {
  readonly agentPanelSlot?: ReactNode;
  readonly bodyKind: WorkspaceInspectorBodyKind;
  readonly effectiveSurfaceAdapter: AnalyticsWorkspaceSurfaceAdapterState | null;
  readonly effectiveThreadId: string | null;
  readonly inspectorBreadcrumbLabel: string;
  readonly inspectorScope: ReactNode;
  readonly isAgentOwned: boolean;
  readonly isAgentRoute: boolean;
  readonly onOpenOverlay: () => void;
  readonly onOpenWorkflowPicker: () => boolean;
  readonly onReturnToConversation: () => void;
  readonly paneKind: WorkspaceInspectorPaneKind;
  readonly productSurfaceAdapter: ProductWorkspaceSurfaceAdapter | null;
  readonly rawPathname: string;
  readonly researchSurfaceAdapter: ResearchWorkspaceSurfaceAdapterRegistration | null;
  readonly searchParamsString: string;
  readonly showOverlayPreview: boolean;
  readonly surfacePresentationAdapter: WorkspaceSurfacePresentationAdapter | null;
  readonly threadContextVersion?: number;
  readonly workspaceSurfaceAdapter: ActiveWorkspaceSurfaceAdapter | null;
};

function WorkspaceInspectorExpandControl({
  conversationSlot,
  fullConversationHref,
  isAgentRoute,
  pendingTransitionRef,
}: WorkspaceInspectorExpandControlProps) {
  if (!conversationSlot) {
    return null;
  }

  if (isAgentRoute) {
    return null;
  }

  return (
    <Button
      asChild
      ariaLabel={WORKSPACE_INSPECTOR_CHROME.openFullConversation}
      className="size-7 shrink-0"
      size={ButtonSize.ICON}
      tooltip={WORKSPACE_INSPECTOR_CHROME.openFullConversation}
      variant={ButtonVariant.GHOST}
      withWrapper={false}
    >
      <Link
        href={fullConversationHref}
        aria-label={WORKSPACE_INSPECTOR_CHROME.openFullConversation}
        title={WORKSPACE_INSPECTOR_CHROME.openFullConversation}
        onClick={() => {
          pendingTransitionRef.current = 'conversation_return';
        }}
      >
        <Maximize2 className="size-3.5" aria-hidden="true" />
      </Link>
    </Button>
  );
}

function WorkspaceInspectorAgentSlot({
  agentPanelSlot,
  isAgentOwned,
  isAgentRoute,
}: {
  readonly agentPanelSlot?: ReactNode;
  readonly isAgentOwned: boolean;
  readonly isAgentRoute: boolean;
}) {
  if (!isAgentOwned) {
    return null;
  }

  if (!isAgentRoute) {
    return null;
  }

  return agentPanelSlot;
}

function WorkspaceInspectorProductSurface({
  paneKind,
  productSurfaceAdapter,
}: {
  readonly paneKind: WorkspaceInspectorPaneKind;
  readonly productSurfaceAdapter: ProductWorkspaceSurfaceAdapter | null;
}) {
  if (paneKind !== 'product-surface') {
    return null;
  }

  if (!productSurfaceAdapter) {
    return null;
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-testid="product-surface-inspector"
    >
      {productSurfaceAdapter.renderInspector()}
    </div>
  );
}

function WorkspaceInspectorEmptyAgent({
  paneKind,
}: {
  readonly paneKind: WorkspaceInspectorPaneKind;
}) {
  if (paneKind !== 'empty-agent') {
    return null;
  }

  return (
    <p className="px-1 text-xs leading-5 text-muted-foreground">
      {WORKSPACE_INSPECTOR_CHROME.emptyAgentBody}
    </p>
  );
}

function WorkspaceInspectorPrimaryAdapter({
  bodyKind,
  effectiveSurfaceAdapter,
  effectiveThreadId,
  rawPathname,
  searchParamsString,
  threadContextVersion,
}: {
  readonly bodyKind: WorkspaceInspectorBodyKind;
  readonly effectiveSurfaceAdapter: AnalyticsWorkspaceSurfaceAdapterState | null;
  readonly effectiveThreadId: string | null;
  readonly rawPathname: string;
  readonly searchParamsString: string;
  readonly threadContextVersion?: number;
}) {
  if (bodyKind === 'workflow') {
    return (
      <WorkflowSurfaceInspector
        contextVersion={threadContextVersion}
        pathname={rawPathname}
        searchParams={new URLSearchParams(searchParamsString)}
        threadId={effectiveThreadId}
      />
    );
  }

  if (bodyKind === 'surface-adapter') {
    return effectiveSurfaceAdapter?.inspectorContent ?? null;
  }

  return null;
}

function WorkspaceInspectorSecondaryAdapter({
  bodyKind,
  researchSurfaceAdapter,
  surfacePresentationAdapter,
}: {
  readonly bodyKind: WorkspaceInspectorBodyKind;
  readonly researchSurfaceAdapter: ResearchWorkspaceSurfaceAdapterRegistration | null;
  readonly surfacePresentationAdapter: WorkspaceSurfacePresentationAdapter | null;
}) {
  if (bodyKind === 'research-adapter') {
    return researchSurfaceAdapter?.inspectorContent ?? null;
  }

  if (bodyKind === 'presentation-adapter') {
    return surfacePresentationAdapter?.inspector ?? null;
  }

  return null;
}

function WorkspaceInspectorWorkspaceAdapterCard({
  workspaceSurfaceAdapter,
}: {
  readonly workspaceSurfaceAdapter: ActiveWorkspaceSurfaceAdapter | null;
}) {
  const translate = useTranslations('common.workspaceInspector');

  if (!workspaceSurfaceAdapter) {
    return null;
  }

  return (
    <div
      className="gen-shell-empty-state p-4"
      data-testid="workspace-surface-adapter-inspector"
    >
      <p className="text-sm font-medium text-foreground">
        {workspaceSurfaceAdapter.registration.title}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {workspaceSurfaceAdapter.registration.description}
      </p>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {translate('fullManagement')}
      </p>
    </div>
  );
}

function WorkspaceInspectorFallbackBody({
  bodyKind,
  inspectorBreadcrumbLabel,
  workspaceSurfaceAdapter,
}: {
  readonly bodyKind: WorkspaceInspectorBodyKind;
  readonly inspectorBreadcrumbLabel: string;
  readonly workspaceSurfaceAdapter: ActiveWorkspaceSurfaceAdapter | null;
}) {
  if (bodyKind === 'workspace-adapter') {
    return (
      <WorkspaceInspectorWorkspaceAdapterCard
        workspaceSurfaceAdapter={workspaceSurfaceAdapter}
      />
    );
  }

  if (bodyKind === 'empty') {
    return (
      <CardEmptyContent
        className="gen-shell-empty-state rounded-lg py-8"
        description={`Start a conversation or choose a workflow to build ${inspectorBreadcrumbLabel} context here.`}
        icon={LayoutGrid}
        label={`No ${inspectorBreadcrumbLabel} context yet`}
        size={CardEmptySize.SM}
      />
    );
  }

  return null;
}

function WorkspaceInspectorWorkspaceActions({
  onOpenOverlay,
  onOpenWorkflowPicker,
  onReturnToConversation,
  showOverlayPreview,
}: {
  readonly onOpenOverlay: () => void;
  readonly onOpenWorkflowPicker: () => boolean;
  readonly onReturnToConversation: () => void;
  readonly showOverlayPreview: boolean;
}) {
  const translate = useTranslations('common.workspaceInspector');

  return (
    <>
      <Button
        icon={<Zap className="size-4" />}
        onClick={onOpenWorkflowPicker}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      >
        {translate('chooseWorkflow')}
      </Button>
      {showOverlayPreview ? (
        <Button
          icon={<Eye className="size-4" />}
          onClick={onOpenOverlay}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {translate('openOverlayPreview')}
        </Button>
      ) : null}
      <Button
        icon={<MessageSquare className="size-4" />}
        onClick={onReturnToConversation}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      >
        {translate('returnToConversation')}
      </Button>
    </>
  );
}

function WorkspaceInspectorWorkspaceBody({
  bodyKind,
  effectiveSurfaceAdapter,
  effectiveThreadId,
  inspectorBreadcrumbLabel,
  inspectorScope,
  onOpenOverlay,
  onOpenWorkflowPicker,
  onReturnToConversation,
  paneKind,
  rawPathname,
  researchSurfaceAdapter,
  searchParamsString,
  showOverlayPreview,
  surfacePresentationAdapter,
  threadContextVersion,
  workspaceSurfaceAdapter,
}: Omit<
  WorkspaceInspectorContextPaneProps,
  'agentPanelSlot' | 'isAgentOwned' | 'isAgentRoute' | 'productSurfaceAdapter'
>) {
  if (paneKind !== 'workspace-body') {
    return null;
  }

  return (
    <>
      {inspectorScope}
      <WorkspaceInspectorPrimaryAdapter
        bodyKind={bodyKind}
        effectiveSurfaceAdapter={effectiveSurfaceAdapter}
        effectiveThreadId={effectiveThreadId}
        rawPathname={rawPathname}
        searchParamsString={searchParamsString}
        threadContextVersion={threadContextVersion}
      />
      <WorkspaceInspectorSecondaryAdapter
        bodyKind={bodyKind}
        researchSurfaceAdapter={researchSurfaceAdapter}
        surfacePresentationAdapter={surfacePresentationAdapter}
      />
      <WorkspaceInspectorFallbackBody
        bodyKind={bodyKind}
        inspectorBreadcrumbLabel={inspectorBreadcrumbLabel}
        workspaceSurfaceAdapter={workspaceSurfaceAdapter}
      />
      <WorkspaceInspectorWorkspaceActions
        onOpenOverlay={onOpenOverlay}
        onOpenWorkflowPicker={onOpenWorkflowPicker}
        onReturnToConversation={onReturnToConversation}
        showOverlayPreview={showOverlayPreview}
      />
    </>
  );
}

function WorkspaceInspectorPaneHeader({
  kind,
}: {
  readonly kind: WorkspaceInspectorAssetKind;
}) {
  const translate = useTranslations('common.workspaceInspector.tabs');
  const Icon = INSPECTOR_PANE_ICONS[kind];

  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="truncate">{translate(kind)}</span>
    </span>
  );
}

function WorkspaceInspectorContextPane(
  props: WorkspaceInspectorContextPaneProps,
) {
  return (
    <AccordionItem value="context">
      <AccordionTrigger
        className="px-3 py-2.5 text-sm hover:no-underline"
        data-testid="workspace-inspector-pane-trigger-context"
      >
        <WorkspaceInspectorPaneHeader kind="context" />
      </AccordionTrigger>
      <AccordionContent
        className={inspectorContextPaneClassName(
          Boolean(props.productSurfaceAdapter),
          props.isAgentOwned,
        )}
      >
        <WorkspaceInspectorAgentSlot
          agentPanelSlot={props.agentPanelSlot}
          isAgentOwned={props.isAgentOwned}
          isAgentRoute={props.isAgentRoute}
        />
        <WorkspaceInspectorProductSurface
          paneKind={props.paneKind}
          productSurfaceAdapter={props.productSurfaceAdapter}
        />
        <WorkspaceInspectorEmptyAgent paneKind={props.paneKind} />
        <WorkspaceInspectorWorkspaceBody
          bodyKind={props.bodyKind}
          effectiveSurfaceAdapter={props.effectiveSurfaceAdapter}
          effectiveThreadId={props.effectiveThreadId}
          inspectorBreadcrumbLabel={props.inspectorBreadcrumbLabel}
          inspectorScope={props.inspectorScope}
          onOpenOverlay={props.onOpenOverlay}
          onOpenWorkflowPicker={props.onOpenWorkflowPicker}
          onReturnToConversation={props.onReturnToConversation}
          paneKind={props.paneKind}
          rawPathname={props.rawPathname}
          researchSurfaceAdapter={props.researchSurfaceAdapter}
          searchParamsString={props.searchParamsString}
          showOverlayPreview={props.showOverlayPreview}
          surfacePresentationAdapter={props.surfacePresentationAdapter}
          threadContextVersion={props.threadContextVersion}
          workspaceSurfaceAdapter={props.workspaceSurfaceAdapter}
        />
      </AccordionContent>
    </AccordionItem>
  );
}

function WorkspaceInspectorFilesAccordionItem() {
  return (
    <AccordionItem value="files">
      <AccordionTrigger
        className="px-3 py-2.5 text-sm hover:no-underline"
        data-testid="workspace-inspector-pane-trigger-files"
      >
        <WorkspaceInspectorPaneHeader kind="files" />
      </AccordionTrigger>
      <AccordionContent className="mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
        <WorkspaceInspectorFilesPane />
      </AccordionContent>
    </AccordionItem>
  );
}

function WorkspaceInspectorBrowserAccordionItem() {
  return (
    <AccordionItem value="browser">
      <AccordionTrigger
        className="px-3 py-2.5 text-sm hover:no-underline"
        data-testid="workspace-inspector-pane-trigger-browser"
      >
        <WorkspaceInspectorPaneHeader kind="browser" />
      </AccordionTrigger>
      <AccordionContent className="mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
        <WorkspaceInspectorBrowserPane />
      </AccordionContent>
    </AccordionItem>
  );
}

function WorkspaceInspectorConversationPane({
  conversationSlot,
  fullConversationHref,
  isAgentRoute,
  isComposerOwner,
  onSetComposerPortalTarget,
  pendingTransitionRef,
}: {
  readonly conversationSlot?: ReactNode;
  readonly fullConversationHref: string;
  readonly isAgentRoute: boolean;
  readonly isComposerOwner: boolean;
  readonly onSetComposerPortalTarget: (element: HTMLElement | null) => void;
  readonly pendingTransitionRef: MutableRefObject<WorkspaceShellPendingTransition | null>;
}) {
  const translate = useTranslations('common.workspaceInspector.tabs');

  if (!conversationSlot) {
    return null;
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col border-t border-border"
      data-testid="workspace-inspector-conversation-section"
    >
      <div className="flex h-9 shrink-0 items-center justify-between gap-1 px-3">
        <span className="gen-label-sm min-w-0 truncate text-muted-foreground">
          {translate('conversation')}
        </span>
        <WorkspaceInspectorExpandControl
          conversationSlot={conversationSlot}
          fullConversationHref={fullConversationHref}
          isAgentRoute={isAgentRoute}
          pendingTransitionRef={pendingTransitionRef}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {conversationSlot}
        {isComposerOwner ? (
          <div
            className="shrink-0 p-2"
            data-testid="workspace-inspector-composer-slot"
            ref={onSetComposerPortalTarget}
          />
        ) : null}
      </div>
    </div>
  );
}

function WorkspaceInspectorContent({
  actions,
  adapters,
  agentPanelSlot = null,
  chrome,
  conversationSlot = null,
  route,
}: WorkspaceInspectorContentProps) {
  const isAgentOwned = isAgentOwnedInspector(
    agentPanelSlot !== null,
    chrome.hasAgentInspectorPanel,
  );
  const paneKind = resolveWorkspaceInspectorPaneKind({
    hasProductSurfaceAdapter: Boolean(adapters.productSurfaceAdapter),
    isAgentOwned,
    isAgentRoute: route.isAgentRoute,
  });
  const bodyKind = resolveWorkspaceInspectorBodyKind({
    hasEffectiveSurfaceAdapter: Boolean(adapters.effectiveSurfaceAdapter),
    hasPresentationAdapter: Boolean(adapters.surfacePresentationAdapter),
    hasResearchAdapter: Boolean(adapters.researchSurfaceAdapter),
    hasWorkspaceAdapter: Boolean(adapters.workspaceSurfaceAdapter),
    isWorkflowInspectorSurface: route.isWorkflowInspectorSurface,
  });
  const showOverlayPreview = shouldShowInspectorOverlayPreview({
    hasEffectiveSurfaceAdapter: Boolean(adapters.effectiveSurfaceAdapter),
    hasPresentationAdapter: Boolean(adapters.surfacePresentationAdapter),
  });

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="workspace-inspector-panes"
    >
      <div className="max-h-[50%] shrink-0 overflow-y-auto">
        <Accordion
          type="multiple"
          value={[...chrome.expandedKinds]}
          onValueChange={actions.onExpandedKindsChange}
        >
          <WorkspaceInspectorContextPane
            agentPanelSlot={agentPanelSlot}
            bodyKind={bodyKind}
            effectiveSurfaceAdapter={adapters.effectiveSurfaceAdapter}
            effectiveThreadId={route.effectiveThreadId}
            inspectorBreadcrumbLabel={chrome.inspectorBreadcrumbLabel}
            inspectorScope={chrome.inspectorScope}
            isAgentOwned={isAgentOwned}
            isAgentRoute={route.isAgentRoute}
            onOpenOverlay={actions.onOpenOverlay}
            onOpenWorkflowPicker={actions.onOpenWorkflowPicker}
            onReturnToConversation={actions.onReturnToConversation}
            paneKind={paneKind}
            productSurfaceAdapter={adapters.productSurfaceAdapter}
            rawPathname={route.rawPathname}
            researchSurfaceAdapter={adapters.researchSurfaceAdapter}
            searchParamsString={route.searchParamsString}
            showOverlayPreview={showOverlayPreview}
            surfacePresentationAdapter={adapters.surfacePresentationAdapter}
            threadContextVersion={route.activeThreadContextVersion}
            workspaceSurfaceAdapter={adapters.workspaceSurfaceAdapter}
          />
          <WorkspaceInspectorFilesAccordionItem />
          <WorkspaceInspectorBrowserAccordionItem />
        </Accordion>
      </div>
      <WorkspaceInspectorConversationPane
        conversationSlot={conversationSlot}
        fullConversationHref={route.fullConversationHref}
        isAgentRoute={route.isAgentRoute}
        isComposerOwner={isInspectorComposerOwner(
          conversationSlot !== null,
          route.isOverlayState,
        )}
        onSetComposerPortalTarget={actions.onSetComposerPortalTarget}
        pendingTransitionRef={actions.pendingTransitionRef}
      />
    </div>
  );
}

export default WorkspaceInspectorContent;
