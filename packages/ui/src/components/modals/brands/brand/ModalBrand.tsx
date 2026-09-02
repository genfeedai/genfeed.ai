'use client';

import {
  AlertCategory,
  AssetCategory,
  AssetScope,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/contracts';
import { isPublicAssetScope } from '@genfeedai/helpers';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { BrandOverlayProps } from '@genfeedai/props/modals/modal.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { BrandsService } from '@genfeedai/services/social/brands.service';
import Alert from '@ui/feedback/alert/Alert';
import {
  LazyModalBrandGenerate,
  LazyModalBrandLink,
} from '@ui/lazy/modal/LazyModal';
import { Modal } from '@ui/modals/compound/modal.compound';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Globe, Loader2 } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';
import BrandEditorForm from './BrandEditorForm';
import BrandOverviewPanel from './BrandOverviewPanel';
import { useModalBrand } from './useModalBrand';

function slugifyBrandLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export default function BrandOverlay({
  brand,
  onConfirm,
  isOpen,
  openKey,
  onClose,
  initialView = 'edit',
}: BrandOverlayProps) {
  const [isCreateSlugDirty, setIsCreateSlugDirty] = useState(false);
  const [isLoadingWebsite, setIsLoadingWebsite] = useState(false);
  const [websiteLoadError, setWebsiteLoadError] = useState<string | null>(null);
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const {
    activeBrand,
    canMoveOrganization,
    connectedPlatformsCount,
    editorTab,
    error,
    fontFamilies,
    form,
    generateCost,
    generateModalType,
    imageModels,
    isGenerating,
    isLoadingBrand,
    isSubmitting,
    musicModels,
    navigateToBrandSettings,
    organizationDefaults,
    organizationOptions,
    overlayDescription,
    overlayTitle,
    overlayView,
    previousPrompt,
    selectedLink,
    socialConnections,
    videoModels,
    closeModalBrand,
    enhanceDescription,
    handleCopy,
    handleCopyPrompt,
    handleDismiss,
    handleGenerateBanner,
    handleGenerateConfirm,
    handleGenerateLogo,
    handleLinkConfirm,
    handleOpenLinkModal,
    handleOpenUploadModal,
    handleRequestDeleteReference,
    handleUpdateBrandField,
    onChange,
    onSubmit,
    onUndo,
    refreshBrand,
    setEditorTab,
    setOverlayView,
  } = useModalBrand({
    brand,
    isOpen,
    onClose,
    onConfirm,
    openKey,
    initialView,
  });

  const handleCreateFieldChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    onChange(event);

    if (name === 'slug') {
      setIsCreateSlugDirty(true);
      return;
    }

    if (name === 'label' && !isCreateSlugDirty) {
      form.setValue('slug', slugifyBrandLabel(value), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  const watchedCreateLabel = form.watch('label');
  const watchedCreateSlug = form.watch('slug');
  const watchedCreateWebsite = form.watch('websiteUrl');
  const canSubmitCreateBrand = (() => {
    const label = (watchedCreateLabel ?? '').trim();
    const slug = (watchedCreateSlug ?? '').trim();
    if (!label || !slug) {
      return false;
    }
    // URL-safe slug: lowercase alphanumerics with optional single hyphens.
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return false;
    }
    const website = (watchedCreateWebsite ?? '').trim();
    if (website) {
      try {
        // Require absolute http(s) URL when provided.
        const parsed = new URL(normalizeWebsiteUrl(website));
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return false;
        }
      } catch {
        return false;
      }
    }
    return true;
  })();

  const canLoadFromWebsite = (() => {
    const website = (watchedCreateWebsite ?? '').trim();
    if (!website || isSubmitting || isLoadingWebsite) {
      return false;
    }
    try {
      const parsed = new URL(normalizeWebsiteUrl(website));
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  })();

  const loadFromWebsite = useCallback(async () => {
    const raw = (form.getValues('websiteUrl') ?? '').trim();
    const websiteUrl = normalizeWebsiteUrl(raw);
    if (!websiteUrl) {
      setWebsiteLoadError('Enter a website URL first');
      return;
    }

    try {
      setIsLoadingWebsite(true);
      setWebsiteLoadError(null);
      form.setValue('websiteUrl', websiteUrl, {
        shouldDirty: true,
        shouldValidate: true,
      });

      const service = await getBrandsService();
      const preview = await service.previewWebsite(websiteUrl);

      if (preview.websiteUrl || preview.sourceUrl) {
        form.setValue(
          'websiteUrl',
          preview.websiteUrl || preview.sourceUrl || websiteUrl,
          {
            shouldDirty: true,
            shouldValidate: true,
          },
        );
      }
      if (preview.label) {
        form.setValue('label', preview.label, {
          shouldDirty: true,
          shouldValidate: true,
        });
        if (!isCreateSlugDirty) {
          form.setValue(
            'slug',
            preview.slug || slugifyBrandLabel(preview.label),
            { shouldDirty: true, shouldValidate: true },
          );
        }
      } else if (preview.slug && !isCreateSlugDirty) {
        form.setValue('slug', preview.slug, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (preview.description) {
        form.setValue('description', preview.description, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (preview.primaryColor) {
        form.setValue('primaryColor', preview.primaryColor, {
          shouldDirty: true,
        });
      }
      if (preview.secondaryColor) {
        form.setValue('secondaryColor', preview.secondaryColor, {
          shouldDirty: true,
        });
      }

      if (!preview.label && !preview.description) {
        notifications.error(
          'Website loaded but no brand name/description was found — fill fields manually',
        );
      } else {
        notifications.success(
          preview.logoUrl
            ? 'Brand details loaded — create the brand, then add the logo from Brand Kit'
            : 'Brand details loaded from website',
        );
      }
    } catch (error) {
      logger.error('Failed to load brand from website', error);
      const message =
        (error as Error)?.message ||
        'Could not load brand data from that website';
      setWebsiteLoadError(message);
      notifications.error(message);
    } finally {
      setIsLoadingWebsite(false);
    }
  }, [form, getBrandsService, isCreateSlugDirty, notifications]);

  if (!brand && !activeBrand) {
    return (
      <Modal.Root
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeModalBrand();
          }
        }}
      >
        <Modal.Content
          size="md"
          className="border-white/10 bg-secondary"
          aria-describedby="brand-create-description"
        >
          <Modal.Header>
            <Modal.Title>New brand</Modal.Title>
            <Modal.Description id="brand-create-description">
              Paste a website to autofill name and description, or enter details
              manually. Finish setup on the brand page after create.
            </Modal.Description>
          </Modal.Header>

          <form
            onSubmit={(event) => {
              if (!canSubmitCreateBrand || isSubmitting) {
                event.preventDefault();
                return;
              }
              void onSubmit(event);
            }}
          >
            <Modal.Body className="space-y-4">
              {error ? (
                <Alert type={AlertCategory.ERROR}>
                  <div className="space-y-1">{error}</div>
                </Alert>
              ) : null}

              {websiteLoadError ? (
                <Alert type={AlertCategory.ERROR}>
                  <div className="space-y-1">{websiteLoadError}</div>
                </Alert>
              ) : null}

              <FormControl
                label="Website"
                description="We’ll scrape the public site for label, slug, and description."
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <Input
                      type="url"
                      name="websiteUrl"
                      control={form.control}
                      onChange={handleCreateFieldChange}
                      placeholder="https://example.com"
                      isDisabled={isSubmitting || isLoadingWebsite}
                    />
                  </div>
                  <Button
                    type="button"
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    isDisabled={!canLoadFromWebsite}
                    isLoading={isLoadingWebsite}
                    icon={
                      isLoadingWebsite ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Globe className="size-4" />
                      )
                    }
                    label={isLoadingWebsite ? 'Loading…' : 'Load from site'}
                    onClick={() => {
                      void loadFromWebsite();
                    }}
                  />
                </div>
              </FormControl>

              <FormControl label="Label" isRequired>
                <Input
                  type="text"
                  name="label"
                  control={form.control}
                  onChange={handleCreateFieldChange}
                  placeholder="Acme"
                  isRequired
                  isDisabled={isSubmitting || isLoadingWebsite}
                />
              </FormControl>

              <FormControl label="Slug" isRequired>
                <Input
                  type="text"
                  name="slug"
                  control={form.control}
                  onChange={handleCreateFieldChange}
                  placeholder="acme"
                  isRequired
                  isDisabled={isSubmitting || isLoadingWebsite}
                />
              </FormControl>

              <FormControl label="Description">
                <Input
                  type="text"
                  name="description"
                  control={form.control}
                  onChange={handleCreateFieldChange}
                  placeholder="What this brand is about"
                  isDisabled={isSubmitting || isLoadingWebsite}
                />
              </FormControl>
            </Modal.Body>

            <Modal.Footer>
              <Modal.CloseButton asChild>
                <Button
                  variant={ButtonVariant.SECONDARY}
                  disabled={isSubmitting || isLoadingWebsite}
                >
                  Cancel
                </Button>
              </Modal.CloseButton>
              <Button
                type="submit"
                variant={ButtonVariant.DEFAULT}
                disabled={
                  isSubmitting || isLoadingWebsite || !canSubmitCreateBrand
                }
              >
                {isSubmitting ? 'Creating…' : 'Create brand'}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Content>
      </Modal.Root>
    );
  }

  return (
    <>
      <EntityOverlayShell
        id={ModalEnum.BRAND}
        title={overlayTitle}
        description={overlayDescription}
        width={activeBrand ? '2xl' : 'xl'}
        surface="flat"
        onClose={closeModalBrand}
        onOpenDetail={navigateToBrandSettings}
        badges={
          activeBrand ? (
            <>
              <span className="gen-label rounded-full border border-border bg-tertiary px-3 py-1 text-muted-foreground">
                Brand
              </span>
              <span className="rounded-full border border-border bg-tertiary px-3 py-1 text-xs text-muted-foreground">
                {isPublicAssetScope(activeBrand.scope) ? 'Public' : 'Private'}
              </span>
              <span className="rounded-full border border-border bg-tertiary px-3 py-1 text-xs text-muted-foreground">
                {connectedPlatformsCount} connected
              </span>
            </>
          ) : (
            <span className="gen-label rounded-full border border-border bg-tertiary px-3 py-1 text-muted-foreground">
              New Brand
            </span>
          )
        }
        actions={
          activeBrand ? (
            <div className="flex items-center gap-2">
              {overlayView === 'overview' ? (
                <Button
                  label="Edit"
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  onClick={() => setOverlayView('edit')}
                />
              ) : (
                <Button
                  label="Overview"
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  onClick={() => setOverlayView('overview')}
                />
              )}
            </div>
          ) : null
        }
      >
        {isLoadingBrand && !activeBrand ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <span className="text-sm text-foreground/60">Loading brand…</span>
          </div>
        ) : null}

        {!isLoadingBrand || activeBrand ? (
          overlayView === 'edit' || !activeBrand ? (
            <div className="mx-auto w-full max-w-5xl">
              <BrandEditorForm
                activeBrand={activeBrand}
                canMoveOrganization={canMoveOrganization}
                editorTab={editorTab}
                error={error}
                fontFamilies={fontFamilies}
                form={form}
                imageModels={imageModels}
                isGenerating={isGenerating}
                isSubmitting={isSubmitting}
                musicModels={musicModels}
                organizationOptions={organizationOptions}
                onCancel={() => {
                  if (activeBrand) {
                    setOverlayView('overview');
                    return;
                  }

                  handleDismiss();
                }}
                onChange={onChange}
                onEnhanceDescription={enhanceDescription}
                onSubmit={onSubmit}
                onTabChange={setEditorTab}
                onUndo={onUndo}
                onCopyPrompt={handleCopyPrompt}
                organizationDefaults={organizationDefaults}
                previousPrompt={previousPrompt}
                videoModels={videoModels}
              />
            </div>
          ) : (
            <BrandOverviewPanel
              activeBrand={activeBrand}
              connectedPlatformsCount={connectedPlatformsCount}
              error={error}
              socialConnections={socialConnections}
              onCopy={handleCopy}
              onDeleteReference={handleRequestDeleteReference}
              onEditBrand={() => setOverlayView('edit')}
              onGenerateBanner={handleGenerateBanner}
              onGenerateLogo={handleGenerateLogo}
              onOpenLinkModal={handleOpenLinkModal}
              onRefreshBrand={async () => {
                await refreshBrand();
                onConfirm?.(true);
              }}
              onTogglePublicProfile={(isPublic) =>
                void handleUpdateBrandField(
                  'scope',
                  isPublic ? AssetScope.PUBLIC : AssetScope.BRAND,
                )
              }
              onUpdateBrand={(field, value) =>
                handleUpdateBrandField(field, value)
              }
              onUploadBanner={() => handleOpenUploadModal(AssetCategory.BANNER)}
              onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
              onUploadReference={() =>
                handleOpenUploadModal(AssetCategory.REFERENCE)
              }
            />
          )
        ) : null}
      </EntityOverlayShell>

      {activeBrand && generateModalType ? (
        <LazyModalBrandGenerate
          type={generateModalType}
          cost={generateCost}
          brandId={activeBrand.id}
          onConfirm={() => {
            void handleGenerateConfirm();
          }}
        />
      ) : null}

      {activeBrand ? (
        <LazyModalBrandLink
          brandId={activeBrand.id}
          link={selectedLink}
          onConfirm={handleLinkConfirm}
        />
      ) : null}
    </>
  );
}
