'use client';

import { useUser } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useBrandOverlay } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { HiPlus } from 'react-icons/hi2';

function BrandAvatar({
  isActive,
  label,
  logoUrl,
}: {
  isActive?: boolean;
  label: string;
  logoUrl?: string | null;
}) {
  if (logoUrl) {
    return (
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl transition-transform duration-200',
          isActive
            ? 'bg-white ring-1 ring-white/30'
            : 'bg-white/[0.06] ring-1 ring-white/[0.08]',
        )}
      >
        <Image
          src={logoUrl}
          alt={label}
          width={40}
          height={40}
          className="h-full w-full object-cover"
          sizes="40px"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold uppercase transition-colors duration-200',
        isActive
          ? 'bg-white text-black'
          : 'bg-white/[0.08] text-white/80 hover:bg-white/[0.12] hover:text-white',
      )}
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}

function RailButton({
  active,
  ariaLabel,
  children,
  onClick,
  testId,
}: {
  active?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <SimpleTooltip label={ariaLabel} position="right">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-pressed={active}
        data-testid={testId}
        data-active={active ? 'true' : 'false'}
        onClick={onClick}
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-colors duration-200',
          active
            ? 'bg-white/[0.08]'
            : 'hover:bg-white/[0.04] focus-visible:bg-white/[0.04]',
        )}
      >
        {children}
      </button>
    </SimpleTooltip>
  );
}

export default function SidebarBrandRail() {
  const { brands, brandId } = useBrand();
  const { user } = useUser();
  const { openBrandOverlay } = useBrandOverlay();
  const pathname = usePathname();
  const router = useRouter();
  const { href } = useOrgUrl();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const [isUpdatingBrand, setIsUpdatingBrand] = useState(false);

  const handleSelect = useCallback(
    async (id: string) => {
      const url = `PATCH /brands/${id}`;

      try {
        setIsUpdatingBrand(true);
        const service = await getUsersService();
        await service.patchMeBrand(id, { isSelected: true });
        logger.info(`${url} success`);
        await user?.reload();

        if (pathname?.match(/\/ingredients\/[^/]+/)) {
          const parts = pathname.split('/');
          const typeIndex = parts.indexOf('ingredients') + 1;
          const type = parts[typeIndex];
          router.push(href(`/ingredients/${type}`));
        } else {
          router.refresh();
        }
      } catch (error) {
        logger.error(`${url} failed`, error);
      } finally {
        setIsUpdatingBrand(false);
      }
    },
    [getUsersService, pathname, router, user],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-x-hidden px-2 py-3">
      <div
        data-testid="sidebar-brand-rail-scroll"
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto scrollbar-thin"
      >
        {brands.map((brand) => {
          const label = brand.label ?? 'Untitled brand';

          return (
            <RailButton
              key={brand.id}
              active={brand.id === brandId}
              ariaLabel={label}
              onClick={() => void handleSelect(brand.id)}
              testId={`sidebar-brand-${brand.id}`}
            >
              <BrandAvatar
                isActive={brand.id === brandId}
                label={label}
                logoUrl={brand.logoUrl}
              />
            </RailButton>
          );
        })}
      </div>

      <RailButton
        ariaLabel="Create brand"
        onClick={() => openBrandOverlay(null)}
        testId="sidebar-brand-create"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-white/[0.16] text-white/70 transition-colors duration-200 hover:border-white/[0.32] hover:bg-white/[0.04] hover:text-white">
          <HiPlus className="h-5 w-5" />
        </div>
      </RailButton>

      {isUpdatingBrand ? (
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
          Syncing
        </span>
      ) : null}
    </div>
  );
}
