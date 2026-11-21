'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Ellipsis, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import type { BrandKitWorkspaceProps } from '@/features/brands/props/brand-kit-workspace.props';
import BrandKitLocalPreview from './BrandKitLocalPreview';
import BrandVideoFramePreview from './BrandVideoFramePreview';
import BrandVideoTab from './BrandVideoTab';
import { finishingFromBrand } from './brand-video-kit.helpers';

type BrandKitSectionId =
  | 'identity'
  | 'publishing'
  | 'strategy'
  | 'video'
  | 'visual'
  | 'voice';

interface BrandKitSectionProps {
  id: BrandKitSectionId;
  title: string;
  onActivate: (id: BrandKitSectionId) => void;
  children: ReactNode;
}

/** One block of the page. Focusing inside it tells the preview what to show. */
function BrandKitSection({
  id,
  title,
  onActivate,
  children,
}: BrandKitSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="min-w-0 scroll-mt-20 space-y-3"
      onFocusCapture={() => onActivate(id)}
    >
      <h2 id={`${id}-heading`} className="text-sm font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function BrandKitWorkspace({
  brand,
  onScan,
  onManualImport,
  onRefreshBrand,
  guidedSetupHref,
  contentRulesHref,
  overview,
  voiceEditor,
  strategyEditor,
  assets,
  renderFields,
  review,
  history,
  share,
  policy,
  content,
  approvedContent,
  isDirty,
  isLoading,
  isSaveDisabled,
  isReadOnly,
  error,
  onSave,
  onVideoChange,
  onFinishingChange,
}: BrandKitWorkspaceProps) {
  const t = useTranslations('pages.brandKitSettings');
  const [openDialog, setOpenDialog] = useState<
    'history' | 'review' | 'share' | null
  >(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const [activeSection, setActiveSection] =
    useState<BrandKitSectionId>('identity');
  const PreviewToggleIcon = isPreviewOpen ? EyeOff : Eye;

  function fields(groups: Parameters<typeof renderFields>[0]) {
    if (isLoading) {
      return (
        <p role="status" className="text-sm text-muted-foreground">
          {t('loading')}
        </p>
      );
    }
    return (
      renderFields(groups) ?? (
        <p className="text-sm text-muted-foreground">{t('startDraft')}</p>
      )
    );
  }

  return (
    <Container
      label={t('settingsAriaLabel')}
      titleVisibility="sr-only"
      moduleChrome
      right={
        <>
          <Button
            variant={ButtonVariant.SECONDARY}
            aria-pressed={isPreviewOpen}
            icon={<PreviewToggleIcon className="size-4" />}
            onClick={() => setIsPreviewOpen((isOpen) => !isOpen)}
          >
            {isPreviewOpen ? t('hidePreview') : t('showPreview')}
          </Button>
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
              <DropdownMenuItem onSelect={() => setOpenDialog('history')}>
                {t('history')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOpenDialog('share')}>
                {t('share')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onManualImport} disabled={isDirty}>
                {t('manualImport')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild disabled={isDirty}>
                <Link href={contentRulesHref}>{t('contentRules')}</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setOpenDialog('review')}>{t('review')}</Button>
        </>
      }
    >
      <div
        className="flex min-w-0 flex-col gap-6"
        data-control-baseline="32px"
        data-scale-role="product"
      >
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div
          className={
            isPreviewOpen
              ? 'grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_21rem]'
              : 'grid min-w-0 gap-10'
          }
        >
          <div className="min-w-0 space-y-10">
            {overview}
            <BrandKitSection
              id="identity"
              title={t('identity')}
              onActivate={setActiveSection}
            >
              {fields(['profile', 'links'])}
              <Collapsible>
                <CollapsibleTrigger>{t('assets')}</CollapsibleTrigger>
                <CollapsibleContent className="space-y-3">
                  {assets}
                </CollapsibleContent>
              </Collapsible>
            </BrandKitSection>
            <BrandKitSection
              id="visual"
              title={t('visual')}
              onActivate={setActiveSection}
            >
              {fields(['visual'])}
            </BrandKitSection>
            <BrandKitSection
              id="voice"
              title={t('voice')}
              onActivate={setActiveSection}
            >
              {voiceEditor}
              <Collapsible>
                <CollapsibleTrigger>{t('snapshot')}</CollapsibleTrigger>
                <CollapsibleContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {t('snapshotHelp')}
                  </p>
                  {fields(['voice'])}
                </CollapsibleContent>
              </Collapsible>
            </BrandKitSection>
            <BrandKitSection
              id="strategy"
              title={t('strategy')}
              onActivate={setActiveSection}
            >
              {strategyEditor}
              <Collapsible>
                <CollapsibleTrigger>{t('snapshot')}</CollapsibleTrigger>
                <CollapsibleContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {t('snapshotHelp')}
                  </p>
                  {fields(['strategy'])}
                </CollapsibleContent>
              </Collapsible>
            </BrandKitSection>
            <BrandKitSection
              id="video"
              title={t('video')}
              onActivate={setActiveSection}
            >
              {isLoading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {t('loading')}
                </p>
              ) : content ? (
                <BrandVideoTab
                  brand={brand}
                  brandId={brand.id}
                  content={content}
                  isDisabled={isReadOnly}
                  onVideoChange={onVideoChange}
                  onFinishingChange={onFinishingChange}
                  onRefreshBrand={onRefreshBrand}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('startDraft')}
                </p>
              )}
            </BrandKitSection>
            {policy ? (
              <BrandKitSection
                id="publishing"
                title={t('publishing')}
                onActivate={setActiveSection}
              >
                {policy}
              </BrandKitSection>
            ) : null}
          </div>
          {isPreviewOpen ? (
            <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
              {activeSection === 'video' && content ? (
                <BrandVideoFramePreview
                  brand={brand}
                  video={content.video}
                  finishing={content.finishing ?? finishingFromBrand(brand)}
                />
              ) : (
                <BrandKitLocalPreview
                  key={brand.id}
                  brand={brand}
                  content={content}
                  approvedContent={approvedContent}
                />
              )}
            </div>
          ) : null}
        </div>
        {content && isDirty ? (
          <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-lg border border-border bg-elevated py-2 pl-4 pr-2">
            <span className="text-sm" role="status">
              {t('unsaved')}
            </span>
            <div className="flex gap-2">
              <Button
                variant={ButtonVariant.SECONDARY}
                onClick={() => setOpenDialog('review')}
              >
                {t('review')}
              </Button>
              <Button onClick={onSave} isDisabled={isSaveDisabled}>
                {t('saveDraft')}
              </Button>
            </div>
          </div>
        ) : null}
        {(
          [
            ['review', t('review'), review],
            ['history', t('history'), history],
            ['share', t('share'), share],
          ] as const
        ).map(([id, title, body]) => (
          <Dialog
            key={id}
            open={openDialog === id}
            onOpenChange={(isOpen) => setOpenDialog(isOpen ? id : null)}
          >
            <DialogContent size="lg">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>
              <DialogBody>{body}</DialogBody>
            </DialogContent>
          </Dialog>
        ))}
      </div>
    </Container>
  );
}
