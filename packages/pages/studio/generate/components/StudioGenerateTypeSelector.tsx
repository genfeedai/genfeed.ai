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
  Mic,
  Music,
  UserRound,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

const TYPE_ICONS: Record<StudioGenerateType, ReactNode> = {
  avatar: <UserRound className="size-3.5" />,
  image: <ImageIcon className="size-3.5" />,
  music: <Music className="size-3.5" />,
  video: <Clapperboard className="size-3.5" />,
  voice: <Mic className="size-3.5" />,
};

const TYPE_OPTIONS = listStudioGenerateTypeConfigs().map((config) => ({
  icon: TYPE_ICONS[config.type],
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
      className="border border-border bg-background hover:bg-accent/50"
      direction={DropdownDirection.UP}
      icon={TYPE_ICONS[type]}
      isDisabled={isDisabled}
      name="studioGenerateType"
      onChange={(_name, value) => onChange(resolveStudioGenerateType(value))}
      options={TYPE_OPTIONS}
      tooltip="Asset type"
      value={type}
    />
  );
}
