'use client';

import { ButtonVariant } from '@genfeedai/contracts';

import type { BrandKitWorkspaceProps } from '@props/pages/brand-kit-workspace.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import BrandKitLocalPreview from './BrandKitLocalPreview';

export default function BrandKitWorkspace({
  brand,
  tab,
  onTabChange,
  onScan,
  onManualImport,
  guidedSetupHref,
  contentRulesHref,
  overview,
  writingEditor,
  assets,
  editor,
  review,
  content,
  approvedContent,
  isDirty,
  isLoading,
  isSaveDisabled,
  error,
  onSave,
}: BrandKitWorkspaceProps) {
  const t = useTranslations('pages.brandKitSettings');
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  return (
    <div
      className="flex min-w-0 flex-col gap-5"
      data-control-baseline="32px"
      data-scale-role="product"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <Tabs
          activeTab={tab}
          onTabChange={onTabChange}
          ariaLabel={t('sectionsLabel')}
          fullWidth={false}
          className="ml-0"
          listClassName="ml-0"
          tabs={[
            { id: 'overview', label: t('overview') },
            { id: 'visual', label: t('visual') },
            { id: 'voice', label: t('voice') },
            { id: 'strategy', label: t('strategy') },
          ]}
        />
        <div className="flex items-center gap-2">
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={onScan}
            isDisabled={isDirty}
          >
            {t('scan')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={ButtonVariant.SECONDARY}
                aria-label={t('actionsLabel')}
                withWrapper={false}
              >
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild disabled={isDirty}>
                <Link href={guidedSetupHref}>{t('guidedSetup')}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onManualImport} disabled={isDirty}>
                {t('manualImport')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild disabled={isDirty}>
                <Link href={contentRulesHref}>{t('contentRules')}</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setIsReviewOpen(true)}>{t('review')}</Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-4">
          {tab === 'overview' ? (
            overview
          ) : tab === 'voice' || tab === 'strategy' ? (
            writingEditor
          ) : isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t('loading')}
            </p>
          ) : (
            editor || (
              <p className="text-sm text-muted-foreground">{t('startDraft')}</p>
            )
          )}
          {tab === 'visual' && (
            <Collapsible>
              <CollapsibleTrigger>{t('assets')}</CollapsibleTrigger>
              <CollapsibleContent className="space-y-3">
                {assets}
              </CollapsibleContent>
            </Collapsible>
          )}
          {(tab === 'voice' || tab === 'strategy') && (
            <Collapsible>
              <CollapsibleTrigger>{t('snapshot')}</CollapsibleTrigger>
              <CollapsibleContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  {t('snapshotHelp')}
                </p>
                {editor}
              </CollapsibleContent>
            </Collapsible>
          )}
          {content && (
            <div className="flex items-center justify-between gap-3 border-t border-border py-3">
              <span className="text-xs text-muted-foreground" role="status">
                {isDirty ? t('unsaved') : t('saved')}
              </span>
              <Button onClick={onSave} isDisabled={isSaveDisabled}>
                {t('saveDraft')}
              </Button>
            </div>
          )}
        </div>
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <BrandKitLocalPreview
            key={brand.id}
            brand={brand}
            content={content}
            approvedContent={approvedContent}
          />
        </div>
      </div>
      <Sheet open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{t('review')}</SheetTitle>
          </SheetHeader>
          <div className="pt-4">{review}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
