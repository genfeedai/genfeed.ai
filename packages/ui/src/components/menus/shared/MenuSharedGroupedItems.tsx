'use client';

import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import MenuItem from '@ui/menus/item/MenuItem';
import CollapsibleGroup from './CollapsibleGroup';
import DrillDownGroupRow from './DrillDownGroupRow';
import WorkspaceInboxMenuItem from './WorkspaceInboxMenuItem';

interface MenuSharedGroupedItemsProps {
  groups: { group: string; items: MenuItemConfig[] }[];
  prefixHref: (
    item:
      | MenuItemConfig
      | { href: string; hrefScope?: MenuItemConfig['hrefScope'] },
  ) => string | undefined;
  isActiveItem: (item: MenuItemConfig) => boolean;
  handleLinkClick: () => void;
  enterNestedGroup: (groupId: string) => void;
}

export default function MenuSharedGroupedItems({
  groups,
  prefixHref,
  isActiveItem,
  handleLinkClick,
  enterNestedGroup,
}: MenuSharedGroupedItemsProps) {
  return (
    <>
      {groups.map((group, groupIndex) => (
        <div key={group.group || `ungrouped-${groupIndex}`}>
          {group.items[0]?.hasDividerAbove && (
            <div className="my-2 border-t border-border" />
          )}
          <CollapsibleGroup
            label={group.group}
            isDrillDown={group.items[0]?.drillDown === true}
          >
            {group.items[0]?.drillDown ? (
              <DrillDownGroupRow
                group={group}
                isActive={group.items.some((item) => isActiveItem(item))}
                defaultHref={prefixHref(group.items[0])}
                onEnter={() => enterNestedGroup(group.group)}
              />
            ) : (
              <ul className="flex flex-col gap-px">
                {group.items.map((item, index) => {
                  const itemHref = prefixHref(item);
                  const itemKey = itemHref ?? `${item.label}-${index}`;

                  return item.href?.startsWith('/workspace/inbox') ? (
                    <WorkspaceInboxMenuItem
                      key={itemKey}
                      href={itemHref}
                      isActive={isActiveItem(item)}
                      isComingSoon={item.isComingSoon}
                      label={item.label}
                      onClick={handleLinkClick}
                      outline={item.outline}
                      solid={item.solid}
                    />
                  ) : (
                    <MenuItem
                      key={itemKey}
                      href={itemHref}
                      label={item.label}
                      icon={item.icon}
                      outline={item.outline}
                      solid={item.solid}
                      isActive={isActiveItem(item)}
                      isComingSoon={item.isComingSoon}
                      onClick={handleLinkClick}
                      variant="icon"
                      isCollapsed={false}
                    />
                  );
                })}
              </ul>
            )}
          </CollapsibleGroup>
        </div>
      ))}
    </>
  );
}
