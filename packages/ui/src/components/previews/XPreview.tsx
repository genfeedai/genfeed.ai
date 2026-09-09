'use client';

import { CredentialPlatform } from '@genfeedai/contracts';
import type { TargetPreviewProps } from '@genfeedai/props/ui/previews.props';
import TargetPreview from './TargetPreview';

export default function XPreview(props: TargetPreviewProps) {
  return (
    <TargetPreview
      {...props}
      target={{ ...props.target, platform: CredentialPlatform.TWITTER }}
    />
  );
}
