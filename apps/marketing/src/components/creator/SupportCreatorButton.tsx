'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { SupportCreatorButtonProps } from '@props/content/creator.props';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import { Coins } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

// The modal pulls in the sign-in client and the payments service, so it loads
// when a reader first opens it, not with the page.
const SupportCreatorModal = dynamic(() => import('./SupportCreatorModal'), {
  ssr: false,
});

/**
 * Opens a modal where a reader sends credits to this creator (#9716). The
 * modal asks a signed-out reader to sign in first.
 */
export default function SupportCreatorButton({
  articleId,
  className,
  handle,
}: SupportCreatorButtonProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <ButtonTracked
        className={className}
        onClick={() => setIsOpen(true)}
        variant={ButtonVariant.SECONDARY}
        trackingName="creator_support_click"
        trackingData={{
          action: articleId ? 'article_support' : 'profile_support',
          label: 'Support',
          profile: handle,
        }}
      >
        <Coins className="size-4" aria-hidden="true" />
        Support @{handle}
      </ButtonTracked>
      {isOpen ? (
        <SupportCreatorModal
          articleId={articleId}
          handle={handle}
          onOpenChange={setIsOpen}
        />
      ) : null}
    </>
  );
}
