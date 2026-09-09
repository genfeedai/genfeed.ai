'use client';

import type { TargetPreviewProps } from '@genfeedai/props/ui/previews.props';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import { buildTargetPreview } from './preview.helpers';

export default function TargetPreview({
  className,
  ...props
}: TargetPreviewProps) {
  return (
    <PlatformPreview className={className} target={buildTargetPreview(props)} />
  );
}
