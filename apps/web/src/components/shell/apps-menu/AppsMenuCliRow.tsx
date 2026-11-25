'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { CopyButton } from '@ui/buttons/CopyButton';
import { Button } from '@ui/primitives/button';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import { Terminal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import AppsMenuRow from '@/components/shell/apps-menu/AppsMenuRow';
import type { AppsMenuPackageManager } from '@/props/ui/apps-menu.props';

const INSTALL_COMMANDS: Record<AppsMenuPackageManager, string> = {
  bun: 'bun add -g @genfeedai/cli',
  npm: 'npm install -g @genfeedai/cli',
};

/** The CLI: Install reveals the install command for bun or npm, to copy. */
export default function AppsMenuCliRow() {
  const translate = useTranslations('common.appsMenu');
  const [isOpen, setIsOpen] = useState(false);
  const [manager, setManager] = useState<AppsMenuPackageManager>('bun');
  const command = INSTALL_COMMANDS[manager];

  return (
    <AppsMenuRow
      action={
        <Button
          aria-expanded={isOpen}
          label={isOpen ? translate('cli.hide') : translate('cli.install')}
          onClick={() => setIsOpen((current) => !current)}
          size={ButtonSize.SM}
          variant={isOpen ? ButtonVariant.GHOST : ButtonVariant.SECONDARY}
          withWrapper={false}
        />
      }
      icon={Terminal}
      subtitle={translate('cli.subtitle')}
      testId="apps-row-cli"
      title={translate('cli.title')}
    >
      {isOpen ? (
        <div className="flex flex-col gap-2" data-testid="apps-cli-install">
          <SegmentedControl<AppsMenuPackageManager>
            ariaLabel={translate('cli.packageManager')}
            onValueChange={setManager}
            options={[
              { label: translate('cli.bun'), value: 'bun' },
              { label: translate('cli.npm'), value: 'npm' },
            ]}
            value={manager}
          />
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1.5">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-xs">
              {command}
            </code>
            <CopyButton label={translate('cli.copy')} value={command} />
          </div>
          <p className="text-xs text-muted-foreground">
            {translate('cli.next')}
          </p>
        </div>
      ) : null}
    </AppsMenuRow>
  );
}
