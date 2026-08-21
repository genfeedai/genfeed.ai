'use client';

import { DropdownDirection } from '@genfeedai/enums';
import type { StudioGenerateType } from '@genfeedai/interfaces/studio/studio-generate.interface';
import type { StudioGenerateTypeSelectorProps } from '@genfeedai/props/studio/studio-generate.props';
import {
  listStudioGenerateTypeConfigs,
  resolveStudioGenerateType,
} from '@pages/studio/generate/utils/studio-generate-types';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import {
  Clapperboard,
  Image as ImageIcon,
  type LucideIcon,
  Mic,
  Music,
  UserRound,
} from 'lucide-react';
import type { ReactElement } from 'react';

const TYPE_ICONS: Record<StudioGenerateType, LucideIcon> = {
  avatar: UserRound,
  image: ImageIcon,
  music: Music,
  video: Clapperboard,
  voice: Mic,
};

function renderTypeIcon(
  type: StudioGenerateType,
  className: string,
): ReactElement {
  const Icon = TYPE_ICONS[type];
  return <Icon className={className} />;
}

const TYPE_OPTIONS = listStudioGenerateTypeConfigs().map((config) => ({
  icon: renderTypeIcon(config.type, 'size-4'),
  label: config.label,
  value: config.type,
}));

/**
 * Asset-type chip. A dropdown rather than a segmented control because five
 * types never fit the composer row at the widths Studio actually renders at.
 */
export default function StudioGenerateTypeSelector({
  isDisabled = false,
  onChange,
  type,
}: StudioGenerateTypeSelectorProps): ReactElement {
  return (
    <ButtonDropdown
      direction={DropdownDirection.UP}
      icon={renderTypeIcon(type, 'size-3.5')}
      isDisabled={isDisabled}
      name="studioGenerateType"
      onChange={(_name, value) => onChange(resolveStudioGenerateType(value))}
      options={TYPE_OPTIONS}
      tooltip="Asset type"
      value={type}
    />
  );
}
