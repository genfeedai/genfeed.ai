'use client';

import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import type { TargetPreviewProps } from '@/props/ui/previews.props';
import { buildTargetPreview } from './preview.helpers';

export default function TargetPreview({
  className,
  ...props
}: TargetPreviewProps) {
  return (
    <PlatformPreview className={className} target={buildTargetPreview(props)} />
  );
}
