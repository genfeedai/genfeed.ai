'use client';

import { useContextSidebar } from '@genfeedai/contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

type InspectorToggleHostValue = {
  claim: (id: string) => () => void;
  isClaimed: boolean;
  ownerId: string | null;
};

const InspectorToggleHostContext =
  createContext<InspectorToggleHostValue | null>(null);
const InspectorTogglePlacedContext = createContext(false);

export function InspectorToggleHost({ children }: { children: ReactNode }) {
  const [owners, setOwners] = useState<readonly string[]>([]);
  const claim = useCallback((id: string) => {
    setOwners((list) => (list.includes(id) ? list : [...list, id]));
    return () => {
      setOwners((list) => list.filter((item) => item !== id));
    };
  }, []);
  const value = useMemo(
    () => ({
      claim,
      isClaimed: owners.length > 0,
      ownerId: owners[0] ?? null,
    }),
    [claim, owners],
  );

  return (
    <InspectorToggleHostContext value={value}>
      {children}
    </InspectorToggleHostContext>
  );
}

/** Pages without a sub-nav still open details from inside the content column. */
export function InspectorToggleFallback() {
  const host = use(InspectorToggleHostContext);
  const sidebar = useContextSidebar();

  if (!sidebar?.selection || host?.isClaimed) {
    return null;
  }

  return (
    <div
      className="flex shrink-0 justify-end border-b border-border px-4 py-1.5"
      data-testid="content-inspector-fallback"
    >
      <ContextInspectorToggle />
    </div>
  );
}

/**
 * The outermost visible section bar hosts the details control. Nested bars
 * leave it there so a page never shows two.
 */
export function useSectionInspectorToggle(isBarVisible: boolean): {
  markPlaced: boolean;
  renderToggle: boolean;
} {
  const id = useId();
  const alreadyPlaced = use(InspectorTogglePlacedContext);
  const sidebar = useContextSidebar();
  const host = use(InspectorToggleHostContext);
  // No selection means the shell keeps the column at zero width. A toggle
  // there would click and show nothing.
  const markPlaced =
    isBarVisible && !alreadyPlaced && Boolean(sidebar?.selection);
  const claim = host?.claim;

  useLayoutEffect(() => {
    if (!markPlaced || !claim) {
      return;
    }

    return claim(id);
  }, [claim, id, markPlaced]);

  return {
    markPlaced,
    // Outside the shell host, the visible bar owns the control itself.
    renderToggle: markPlaced && (host ? host.ownerId === id : true),
  };
}

export function InspectorTogglePlacement({
  children,
  hostsToggle,
}: {
  children: ReactNode;
  hostsToggle: boolean;
}) {
  const alreadyPlaced = use(InspectorTogglePlacedContext);

  return (
    <InspectorTogglePlacedContext value={alreadyPlaced || hostsToggle}>
      {children}
    </InspectorTogglePlacedContext>
  );
}

export default function ContextInspectorToggle() {
  const sidebar = useContextSidebar();
  const translate = useTranslations('common.contextSidebar');

  if (!sidebar?.selection) {
    return null;
  }

  return (
    <>
      <Button
        aria-controls="workspace-context-inspector"
        aria-expanded={sidebar.isOpen}
        ariaLabel={sidebar.isOpen ? translate('collapse') : translate('expand')}
        className="hidden size-8 xl:inline-flex"
        data-active={sidebar.isOpen ? 'true' : 'false'}
        data-testid="topbar-inspector-toggle"
        onClick={sidebar.toggle}
        size={ButtonSize.ICON}
        type="button"
        variant={ButtonVariant.GHOST}
      >
        {sidebar.isOpen ? (
          <PanelRightClose className="size-4" />
        ) : (
          <PanelRightOpen className="size-4" />
        )}
      </Button>
      <Button
        aria-controls="workspace-context-inspector-drawer"
        aria-expanded={sidebar.isMobileOpen}
        ariaLabel={
          sidebar.isMobileOpen ? translate('close') : translate('open')
        }
        className="inline-flex size-8 xl:hidden"
        data-testid="topbar-inspector-drawer-toggle"
        onClick={() => sidebar.setIsMobileOpen(!sidebar.isMobileOpen)}
        size={ButtonSize.ICON}
        type="button"
        variant={ButtonVariant.GHOST}
      >
        {sidebar.isMobileOpen ? (
          <PanelRightClose className="size-4" />
        ) : (
          <PanelRightOpen className="size-4" />
        )}
      </Button>
    </>
  );
}
