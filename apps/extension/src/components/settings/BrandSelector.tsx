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
import type { ReactElement } from 'react';
import { useBrandVoice } from '~hooks/use-brand-voice';
import { selectWorkspaceBrand } from '~services/workspace.service';
import { useBrandStore } from '~store/use-brand-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

export function BrandSelector(): ReactElement {
  const brands = useBrandStore((state) => state.brands);
  const activeBrandId = useBrandStore((state) => state.activeBrandId);
  useBrandVoice();
  const workspace = useWorkspaceStore();
  const selected = brands.find((brand) => brand.id === activeBrandId);
  const label =
    selected?.label ?? (brands.length ? 'Select brand' : 'No brands');

  return (
    <SwitcherDropdown
      className="min-w-0 w-full"
      minWidth={220}
      items={brands.map((brand) => ({
        id: brand.id,
        label: brand.label,
        imageUrl: brand.logoUrl,
        isActive: brand.id === activeBrandId,
      }))}
      isDisabled={workspace.status !== 'ready' || brands.length === 0}
      isLoading={workspace.status === 'loading'}
      hasSearch={brands.length >= 5}
      searchPlaceholder="Search brands…"
      emptyMessage="No brands"
      onSelect={(id) => {
        void selectWorkspaceBrand(id).catch(() => undefined);
      }}
      renderTrigger={({ isOpen }) => (
        <Button
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          ariaLabel={`Switch brand, ${label}`}
          title={label}
          className={cn(
            SWITCHER_TRIGGER_CLASSNAME,
            'px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            isOpen && SWITCHER_TRIGGER_OPEN_CLASSNAME,
          )}
        >
          <SwitcherAvatar
            alt={label}
            imageUrl={selected?.logoUrl}
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
