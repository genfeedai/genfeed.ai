'use client';

import { FONT_FAMILY_METADATA, FontFamily } from '@genfeedai/contracts';
import type { BrandFontAssetReadV1 } from '@genfeedai/contracts/api-types/contracts/brand-font-asset.contract';
import {
  BRAND_FONT_FAMILY_NAME_MAX,
  BRAND_FONT_ROLES,
  type BrandFontRole,
  type BrandFontRoleAssignment,
  type BrandFontRoles,
} from '@genfeedai/contracts/api-types/contracts/brand-kit-style.contract';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useBrandFonts } from '@/features/brands/hooks/use-brand-fonts';
import type { BrandStyleFieldEditorProps } from '@/features/brands/props/brand-kit-style.props';

const NONE = 'none';
const PRESET_PREFIX = 'preset:';
const UPLOAD_PREFIX = 'upload:';
const FILE_EXTENSION_PATTERN = /\.[^.]+$/u;
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

function readRoles(value: unknown): BrandFontRoles {
  return isRecord(value) ? (value as BrandFontRoles) : {};
}

function selectValue(assignment: BrandFontRoleAssignment | undefined): string {
  if (!assignment) return NONE;
  return assignment.source === 'preset'
    ? `${PRESET_PREFIX}${assignment.fontFamily}`
    : `${UPLOAD_PREFIX}${assignment.assetId}`;
}

function defaultFamily(font: BrandFontAssetReadV1): string {
  const name =
    font.displayName ??
    font.originalFileName?.replace(FILE_EXTENSION_PATTERN, '') ??
    font.id;
  return name.slice(0, BRAND_FONT_FAMILY_NAME_MAX);
}

/**
 * Which font each text role uses (#9708): an uploaded brand font or one of the
 * fonts Genfeed ships. Each role shows a live line of text in its font.
 */
export default function BrandFontRolesEditor({
  brandId,
  label,
  value,
  isDisabled,
  onChange,
}: BrandStyleFieldEditorProps) {
  const t = useTranslations('pages.brandOsSettings.fontRoles');
  const { fonts, cssFamilies } = useBrandFonts(brandId);
  const roles = readRoles(value);

  function setRole(role: BrandFontRole, next: BrandFontRoleAssignment | null) {
    const updated: BrandFontRoles = { ...roles };
    if (next) updated[role] = next;
    else delete updated[role];
    onChange(updated);
  }

  function choose(role: BrandFontRole, choice: string) {
    if (choice === NONE) return setRole(role, null);
    if (choice.startsWith(PRESET_PREFIX)) {
      const fontFamily = choice.slice(PRESET_PREFIX.length) as FontFamily;
      return setRole(role, { fontFamily, source: 'preset' });
    }
    const font = fonts.find(
      (candidate) => candidate.id === choice.slice(UPLOAD_PREFIX.length),
    );
    if (!font) return;
    setRole(role, {
      assetId: font.id,
      contentHash: font.contentHash,
      family: defaultFamily(font),
      source: 'upload',
      style: 'normal',
      weight: 400,
    });
  }

  function previewStyle(assignment: BrandFontRoleAssignment | undefined) {
    if (!assignment) return undefined;
    if (assignment.source === 'preset') {
      const metadata = FONT_FAMILY_METADATA[assignment.fontFamily];
      return {
        fontFamily: `${metadata.cssFamily}, sans-serif`,
        fontWeight: metadata.cssWeight,
      };
    }
    const cssFamily = cssFamilies[assignment.assetId];
    return {
      fontFamily: cssFamily ? `"${cssFamily}", sans-serif` : undefined,
      fontStyle: assignment.style,
      fontWeight: assignment.weight,
    };
  }

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-4">
      {BRAND_FONT_ROLES.map((role) => {
        const assignment = roles[role];
        const roleLabel = t(`role.${role}`);
        return (
          <div key={role} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-xs font-medium">{roleLabel}</span>
              <Select
                value={selectValue(assignment)}
                disabled={isDisabled}
                onValueChange={(choice) => choose(role, choice)}
              >
                <SelectTrigger
                  className="w-56"
                  aria-label={t('chooseFor', { role: roleLabel })}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('none')}</SelectItem>
                  {fonts.length > 0 ? (
                    <SelectGroup>
                      <SelectLabel>{t('uploaded')}</SelectLabel>
                      {fonts.map((font) => (
                        <SelectItem
                          key={font.id}
                          value={`${UPLOAD_PREFIX}${font.id}`}
                        >
                          {defaultFamily(font)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                  <SelectGroup>
                    <SelectLabel>{t('builtIn')}</SelectLabel>
                    {Object.values(FontFamily).map((font) => (
                      <SelectItem key={font} value={`${PRESET_PREFIX}${font}`}>
                        {FONT_FAMILY_METADATA[font].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {assignment?.source === 'upload' ? (
                <>
                  <Input
                    className="w-44"
                    aria-label={t('familyFor', { role: roleLabel })}
                    disabled={isDisabled}
                    maxLength={BRAND_FONT_FAMILY_NAME_MAX}
                    value={assignment.family}
                    onChange={(event) =>
                      setRole(role, {
                        ...assignment,
                        family: event.target.value,
                      })
                    }
                  />
                  <Select
                    value={String(assignment.weight)}
                    disabled={isDisabled}
                    onValueChange={(weight) =>
                      setRole(role, { ...assignment, weight: Number(weight) })
                    }
                  >
                    <SelectTrigger
                      className="w-24"
                      aria-label={t('weightFor', { role: roleLabel })}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEIGHTS.map((weight) => (
                        <SelectItem key={weight} value={String(weight)}>
                          {weight}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={assignment.style}
                    disabled={isDisabled}
                    onValueChange={(style) =>
                      setRole(role, {
                        ...assignment,
                        style: style === 'italic' ? 'italic' : 'normal',
                      })
                    }
                  >
                    <SelectTrigger
                      className="w-28"
                      aria-label={t('styleFor', { role: roleLabel })}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">{t('styleNormal')}</SelectItem>
                      <SelectItem value="italic">{t('styleItalic')}</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              ) : null}
            </div>
            {assignment ? (
              <p
                className={
                  role === 'heading'
                    ? 'text-2xl'
                    : role === 'caption'
                      ? 'text-xs'
                      : 'text-sm'
                }
                style={previewStyle(assignment)}
              >
                {t(`sample.${role}`)}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
