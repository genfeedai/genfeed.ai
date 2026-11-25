'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { BRAND_HANDLE_MAX_LENGTH } from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { BrandDetailOverviewProps } from '@props/pages/brand-detail.props';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { Button } from '@ui/primitives/button';
import { EditableText } from '@ui/primitives/editable-text';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import { Sparkles, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ICON_BUTTON_CLASS = 'shrink-0 [&_svg]:size-3.5';

/**
 * The brand's header, laid out like the public profile at genfeed.ai/@handle:
 * the picture beside the name and handle, the description under them, then
 * the actions. Everything here is edited in place; `visibility` and `footer`
 * are slots for the parts that depend on the page.
 */
export default function BrandDetailOverview({
  brand,
  isAvatarOverlapping = false,
  isGeneratingLogo,
  onUploadLogo,
  onGenerateLogo,
  onUpdateBrand,
  onUpdateHandle,
  visibility,
  footer,
}: BrandDetailOverviewProps) {
  const t = useTranslations('pages.brandDetailOverview');

  return (
    <header
      className={cn(
        'grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 sm:gap-x-6',
        isAvatarOverlapping ? 'px-4 sm:px-6' : 'px-1',
      )}
    >
      <div
        className={cn(
          'relative z-10 w-fit sm:row-span-2',
          // The ring is drawn on the picture's own frame, so it follows the
          // corners exactly and never pokes past the banner's edge.
          isAvatarOverlapping &&
            '-mt-12 rounded-xl bg-background ring-4 ring-background sm:-mt-16',
        )}
      >
        <BrandAvatar
          alt={`${brand.label} logo`}
          name={brand.label}
          size="3xl"
          src={brand.logoUrl}
        >
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity' /* design-system-allow-content-color */,
              hoverRevealClassName(),
            )}
          >
            <div className="flex gap-1.5">
              <Button
                icon={<Upload className="size-3.5" />}
                ariaLabel={t('uploadProfilePicture')}
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.ICON}
                className={ICON_BUTTON_CLASS}
                onClick={onUploadLogo}
              />
              <Button
                icon={<Sparkles className="size-3.5" />}
                ariaLabel={t('generateProfilePicture')}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.ICON}
                className={ICON_BUTTON_CLASS}
                onClick={onGenerateLogo}
                isLoading={isGeneratingLogo}
              />
            </div>
          </div>
        </BrandAvatar>
      </div>

      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3 self-start pt-1">
        <div className="min-w-0 flex-1 basis-48">
          <EditableText
            ariaLabel={t('editBrandName')}
            className="mb-1"
            displayClassName="text-2xl font-semibold sm:text-3xl"
            isRequired
            onSave={(value) => onUpdateBrand('label', value)}
            value={brand.label}
          />
          {brand.slug && onUpdateHandle ? (
            // The leading `@` is display only; the save normalizes it away.
            <EditableText
              ariaLabel={t('editBrandHandle')}
              displayClassName="text-sm text-muted-foreground"
              isRequired
              maxLength={BRAND_HANDLE_MAX_LENGTH + 1}
              onSave={onUpdateHandle}
              value={`@${brand.slug}`}
            />
          ) : brand.slug ? (
            <p className="text-sm text-muted-foreground">@{brand.slug}</p>
          ) : null}
        </div>
        {visibility ? (
          // The control sits on the header's right edge, beside the name; in a
          // narrow column it wraps under it.
          <div className="min-w-0 max-w-full">{visibility}</div>
        ) : null}
      </div>

      <div className="col-span-2 max-w-prose sm:col-span-1 sm:col-start-2">
        <EditableText
          ariaLabel={t('editBrandDescription')}
          displayClassName="text-base leading-7 text-foreground/80"
          isMultiline
          onSave={(value) => onUpdateBrand('description', value)}
          placeholder={t('addDescription')}
          value={brand.description}
        />
      </div>

      {footer ? <div className="col-span-2 pt-1">{footer}</div> : null}
    </header>
  );
}
