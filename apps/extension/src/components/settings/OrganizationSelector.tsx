import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import SwitcherAvatar from '@ui/menus/switcher-dropdown/SwitcherAvatar';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import {
  SWITCHER_AVATAR_CLASSNAME,
  SWITCHER_CHEVRON_CLASSNAME,
  SWITCHER_LABEL_CLASSNAME,
  SWITCHER_TRIGGER_CLASSNAME,
  SWITCHER_TRIGGER_OPEN_CLASSNAME,
} from '@ui/menus/switchers/switcher-trigger.classes';
import { Button } from '@ui/primitives/button';
import { ChevronsUpDown } from 'lucide-react';
import { activateWorkspace } from '~services/workspace.service';
import { useWorkspaceStore } from '~store/use-workspace-store';

export function OrganizationSelector() {
  const workspace = useWorkspaceStore();
  const snapshot =
    workspace.status === 'ready' || workspace.status === 'refreshing'
      ? workspace.snapshot
      : null;
  const organizations = snapshot?.organizations ?? [];
  const selected = organizations.find(
    (organization) => organization.id === snapshot?.organizationId,
  );
  const isDuplicateLabel = (candidate: string): boolean =>
    organizations.filter((item) => item.label === candidate).length > 1;
  const label = selected
    ? isDuplicateLabel(selected.label)
      ? `${selected.label} (${selected.slug})`
      : selected.label
    : (snapshot?.organizationLabel ?? 'Organization');

  return (
    <SwitcherDropdown
      className="min-w-0 w-full"
      minWidth={240}
      items={organizations.map((organization) => ({
        id: organization.id,
        imageUrl: organization.logoUrl || undefined,
        isActive: organization.id === snapshot?.organizationId,
        label: isDuplicateLabel(organization.label)
          ? `${organization.label} (${organization.slug})`
          : organization.label,
      }))}
      isDisabled={workspace.status !== 'ready' || Boolean(snapshot?.isApiKey)}
      isLoading={!snapshot}
      hasSearch={organizations.length >= 5}
      searchPlaceholder="Search organizations…"
      emptyMessage="No organizations"
      onSelect={(id) => {
        void activateWorkspace(id).catch(() => undefined);
      }}
      renderTrigger={({ isOpen }) => (
        <Button
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          ariaLabel={`Switch organization, ${label}`}
          title={label}
          className={cn(
            SWITCHER_TRIGGER_CLASSNAME,
            'px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            isOpen && SWITCHER_TRIGGER_OPEN_CLASSNAME,
          )}
        >
          <SwitcherAvatar
            alt={label}
            imageUrl={selected?.logoUrl || undefined}
            letter={label.charAt(0).toUpperCase()}
            fallbackClassName={SWITCHER_AVATAR_CLASSNAME}
            imageWrapperClassName={SWITCHER_AVATAR_CLASSNAME}
          />
          <span className={SWITCHER_LABEL_CLASSNAME}>{label}</span>
          <ChevronsUpDown className={SWITCHER_CHEVRON_CLASSNAME} aria-hidden />
        </Button>
      )}
    />
  );
}
