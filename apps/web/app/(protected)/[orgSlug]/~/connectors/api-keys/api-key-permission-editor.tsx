'use client';

import {
  API_KEY_PERMISSION_GROUPS,
  getSelfServiceApiKeyPermissionLevels,
} from '@genfeedai/contracts/constants';
import type { ApiKeyPermissionLevel } from '@genfeedai/contracts/interfaces';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { useTranslations } from 'next-intl';
import type { ApiKeyPermissionEditorProps } from '@/features/settings/props/api-keys-content.props';

/**
 * None, Read or Write per resource, in groups. Only levels a signed-in user
 * may grant to their own key are offered; Brands Write stays admin-minted.
 */
export default function ApiKeyPermissionEditor({
  levels,
  onLevelChange,
}: ApiKeyPermissionEditorProps) {
  const translate = useTranslations('common.settings.apiKeys.permissions');

  return (
    <div className="space-y-4">
      {API_KEY_PERMISSION_GROUPS.map((group) => (
        <section aria-labelledby={`api-key-group-${group.id}`} key={group.id}>
          <h3
            className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
            id={`api-key-group-${group.id}`}
          >
            {translate(`groups.${group.id}`)}
          </h3>
          <div className="space-y-2">
            {group.resources.map((resource) => {
              const resourceLabel = translate(`resources.${resource.id}`);
              const offeredLevels =
                getSelfServiceApiKeyPermissionLevels(resource);

              return (
                <div
                  className="grid gap-2 sm:grid-cols-[12rem_1fr] sm:items-center"
                  key={resource.id}
                >
                  <span className="text-sm">{resourceLabel}</span>
                  <OptionTileGroup<ApiKeyPermissionLevel>
                    ariaLabel={resourceLabel}
                    columns={3}
                    onValueChange={(level) => onLevelChange(resource.id, level)}
                    value={levels[resource.id] ?? 'none'}
                  >
                    {offeredLevels.map((level) => (
                      <OptionTile
                        key={level}
                        size="sm"
                        title={translate(`levels.${level}`)}
                        value={level}
                      />
                    ))}
                  </OptionTileGroup>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
