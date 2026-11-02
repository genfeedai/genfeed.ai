'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
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
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  BrandKitWorkspaceProps,
  BrandPreviewSource,
  BrandPreviewTemplate,
} from '@/features/brands/props/brand-kit-workspace.props';
import BrandKitIconActions from './BrandKitIconActions';
import BrandKitLocalPreview from './BrandKitLocalPreview';
import BrandKitPreviewMenu from './BrandKitPreviewMenu';
import { useBrandKitSectionTabs } from './useBrandKitSectionTabs';

export default function BrandKitWorkspace({
  brand,
  tab,
  onScan,
  onManualImport,
  guidedSetupHref,
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
  const [previewSource, setPreviewSource] =
    useState<BrandPreviewSource>('draft');
  const [previewTemplate, setPreviewTemplate] =
    useState<BrandPreviewTemplate>('social');
  const sectionTabs = useBrandKitSectionTabs(tab);
  return (
    <Container
      label={t('settingsAriaLabel')}
      titleVisibility="sr-only"
      moduleChrome
      headerTabs={sectionTabs}
      iconActions={
        <BrandKitIconActions
          guidedSetupHref={guidedSetupHref}
          isDisabled={isDirty}
          onManualImport={onManualImport}
          onScan={onScan}
        />
      }
      right={
        <>
          <BrandKitPreviewMenu
            isApprovedAvailable={approvedContent !== null}
            onSourceChange={setPreviewSource}
            onTemplateChange={setPreviewTemplate}
            source={previewSource}
            template={previewTemplate}
          />
          {isDirty ? (
            <span className="text-xs text-muted-foreground" role="status">
              {t('unsaved')}
            </span>
          ) : null}
          {content ? (
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              onClick={onSave}
              isDisabled={isSaveDisabled}
            >
              {t('saveDraft')}
            </Button>
          ) : null}
          <Button size={ButtonSize.SM} onClick={() => setIsReviewOpen(true)}>
            {t('review')}
          </Button>
        </>
      }
    >
      <div
        className="flex min-w-0 flex-col gap-5"
        data-control-baseline="32px"
        data-scale-role="product"
      >
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
                <p className="text-sm text-muted-foreground">
                  {t('startDraft')}
                </p>
              )
            )}
            {tab === 'visual' ? assets : null}
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
          </div>
          <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
            <BrandKitLocalPreview
              key={brand.id}
              brand={brand}
              content={content}
              approvedContent={approvedContent}
              source={previewSource}
              template={previewTemplate}
            />
          </div>
        </div>
        <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>{t('review')}</DialogTitle>
            </DialogHeader>
            <DialogBody>{review}</DialogBody>
          </DialogContent>
        </Dialog>
      </div>
    </Container>
  );
}
