'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandOrganizationSlug } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { CommandPaletteService } from '@genfeedai/services/core/command-palette.service';
import { registerDefaultCommands } from '@genfeedai/services/core/commands.registry';
import { logger } from '@genfeedai/services/core/logger.service';
import { useEffect } from 'react';

export function useDefaultCommandsRegistration(): void {
  const { confirmedOrganizationSlug } = useRoutedOrganization();
  const { selectedBrand } = useBrand();
  // Session state, not the route-only `useOrgUrl` slugs: that hook forces
  // brandSlug to '' on every org-scoped route without a brand segment (org
  // settings, org overview, …), which hid every command — including the
  // context-free ones — everywhere except a fully brand-scoped route (#4660).
  const orgSlug =
    confirmedOrganizationSlug || getBrandOrganizationSlug(selectedBrand);
  const brandSlug = selectedBrand?.slug ?? '';

  useEffect(() => {
    let registeredCommandIds: string[] = [];

    try {
      registeredCommandIds = registerDefaultCommands({ brandSlug, orgSlug });

      logger.debug('Command palette initialized with default commands');
    } catch (error) {
      logger.warn('Failed to initialize command palette', { error });
    }

    // The service is a module singleton that outlives this component, so
    // unregister on unmount — otherwise any remount (StrictMode, layout
    // branch swap, /settings navigation) re-registers the same ids and
    // emits "Commands already registered" warnings.
    return () => {
      if (registeredCommandIds.length > 0) {
        CommandPaletteService.unregisterCommands(registeredCommandIds);
      }
    };
  }, [orgSlug, brandSlug]);
}
