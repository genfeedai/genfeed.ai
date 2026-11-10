'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ConnectorsSection } from '@genfeedai/props/pages/connectors.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { LayoutProps } from '@props/layout/layout.props';
import { ErrorBoundary } from '@ui/display/error-boundary/ErrorBoundary';
import Container from '@ui/layout/container/Container';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { Button } from '@ui/primitives/button';
import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  type ConnectorsPrimaryAction,
  ConnectorsPrimaryActionContext,
} from './connectors-primary-action';
import {
  CONNECTORS_ICON,
  CONNECTORS_SECTIONS,
  isConnectorsSection,
} from './connectors-sections';

/**
 * One page for everything an organization connects (#9905). The section
 * switch is a view menu in the sub bar, never a tab strip. A section that
 * fails to load shows its own error and leaves the switch, and so the other
 * sections, usable.
 */
export default function ConnectorsShell({ children }: LayoutProps) {
  const translate = useTranslations('pages.connectors');
  const { push } = useRouter();
  const { orgHref } = useOrgUrl();
  const [primaryAction, setPrimaryAction] =
    useState<ConnectorsPrimaryAction | null>(null);
  const segment = useSelectedLayoutSegment();
  const activeSection: ConnectorsSection = isConnectorsSection(segment)
    ? segment
    : 'agents';

  return (
    <Container
      icon={CONNECTORS_ICON}
      label={translate('title')}
      moduleChrome
      right={
        <>
          <ViewMenu<ConnectorsSection>
            activeView={activeSection}
            onChange={(section) => {
              const target = CONNECTORS_SECTIONS.find(
                (config) => config.section === section,
              );
              if (target) {
                push(orgHref(target.path));
              }
            }}
            options={CONNECTORS_SECTIONS.map((config) => {
              const Icon = config.icon;
              return {
                icon: <Icon aria-hidden="true" className="size-4" />,
                label: translate(`sections.${config.labelKey}`),
                type: config.section,
              };
            })}
            trigger="label"
          />
          {primaryAction ? (
            <Button
              label={primaryAction.label}
              onClick={primaryAction.onClick}
              variant={ButtonVariant.DEFAULT}
            />
          ) : null}
        </>
      }
    >
      <ConnectorsPrimaryActionContext.Provider value={{ setPrimaryAction }}>
        <ErrorBoundary
          description={translate('sectionErrorDescription')}
          key={activeSection}
          presentation="inline"
          title={translate('sectionErrorTitle')}
        >
          {children}
        </ErrorBoundary>
      </ConnectorsPrimaryActionContext.Provider>
    </Container>
  );
}
