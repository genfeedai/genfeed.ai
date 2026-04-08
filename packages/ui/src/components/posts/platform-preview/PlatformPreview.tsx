'use client';

import { ButtonVariant, CredentialPlatform } from '@genfeedai/enums';
import type { IIngredient, IPost } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaXTwitter,
} from 'react-icons/fa6';
import {
  HiArrowPath,
  HiBookmark,
  HiChatBubbleOvalLeft,
  HiHeart,
  HiPaperAirplane,
} from 'react-icons/hi2';

type PreviewPlatform = 'instagram' | 'twitter' | 'facebook' | 'linkedin';

const PREVIEW_PLATFORMS: {
  key: PreviewPlatform;
  label: string;
  icon: React.ReactNode;
  forPlatforms: string[];
}[] = [
  {
    forPlatforms: [CredentialPlatform.INSTAGRAM],
    icon: <FaInstagram className="h-3.5 w-3.5" />,
    key: 'instagram',
    label: 'Instagram',
  },
  {
    forPlatforms: [CredentialPlatform.TWITTER],
    icon: <FaXTwitter className="h-3.5 w-3.5" />,
    key: 'twitter',
    label: 'X / Twitter',
  },
  {
    forPlatforms: [CredentialPlatform.FACEBOOK],
    icon: <FaFacebook className="h-3.5 w-3.5" />,
    key: 'facebook',
    label: 'Facebook',
  },
  {
    forPlatforms: [CredentialPlatform.LINKEDIN],
    icon: <FaLinkedin className="h-3.5 w-3.5" />,
    key: 'linkedin',
    label: 'LinkedIn',
  },
];

export interface PlatformPreviewProps {
  post: IPost;
  accountName?: string;
  accountHandle?: string;
}

function TwitterPreview({
  post,
  accountName,
  accountHandle,
}: {
  post: IPost;
  accountName: string;
  accountHandle: string;
}) {
  const ingredient = post.ingredients?.[0] as IIngredient | undefined;
  return (
    <InsetSurface density="compact" tone="muted">
      <div className="flex gap-2">
        <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-bold text-sm">{accountName}</span>
            <span className="text-muted-foreground text-sm">
              @{accountHandle}
            </span>
          </div>
          <p className="text-sm mt-1 whitespace-pre-wrap line-clamp-6">
            {post.description}
          </p>
          {ingredient?.ingredientUrl && (
            <div className="mt-2 rounded-xl overflow-hidden border">
              <Image
                src={ingredient.ingredientUrl}
                alt=""
                width={400}
                height={225}
                className="w-full object-cover max-h-48"
              />
            </div>
          )}
          <div className="flex justify-between mt-3 text-muted-foreground">
            <HiChatBubbleOvalLeft className="h-4 w-4" />
            <HiArrowPath className="h-4 w-4" />
            <HiHeart className="h-4 w-4" />
            <HiBookmark className="h-4 w-4" />
          </div>
        </div>
      </div>
    </InsetSurface>
  );
}

function InstagramPreview({
  post,
  accountName,
}: {
  post: IPost;
  accountName: string;
}) {
  const ingredient = post.ingredients?.[0] as IIngredient | undefined;
  return (
    <InsetSurface className="overflow-hidden" density="compact" tone="muted">
      <div className="flex items-center gap-2 p-3">
        <div className="h-8 w-8 rounded-full bg-muted" />
        <span className="font-semibold text-sm">{accountName}</span>
      </div>
      {ingredient?.ingredientUrl && (
        <Image
          src={ingredient.ingredientUrl}
          alt=""
          width={400}
          height={400}
          className="w-full object-cover aspect-square"
        />
      )}
      {!ingredient?.ingredientUrl && (
        <div className="w-full aspect-square bg-muted flex items-center justify-center text-muted-foreground text-sm">
          No media
        </div>
      )}
      <div className="p-3">
        <div className="flex gap-4 mb-2">
          <HiHeart className="h-5 w-5" />
          <HiChatBubbleOvalLeft className="h-5 w-5" />
          <HiPaperAirplane className="h-5 w-5" />
          <HiBookmark className="h-5 w-5 ml-auto" />
        </div>
        <p className="text-sm">
          <span className="font-semibold">{accountName}</span>{' '}
          <span className="line-clamp-2">{post.description}</span>
        </p>
      </div>
    </InsetSurface>
  );
}

export default function PlatformPreview({
  post,
  accountName = 'Your Account',
  accountHandle = 'youraccount',
}: PlatformPreviewProps) {
  const relevantPlatforms = useMemo(
    () =>
      PREVIEW_PLATFORMS.filter(
        (p) => !post.platform || p.forPlatforms.includes(post.platform),
      ),
    [post.platform],
  );

  const [activePlatform, setActivePlatform] = useState<PreviewPlatform>(
    () => relevantPlatforms[0]?.key ?? 'twitter',
  );

  if (relevantPlatforms.length === 0) {
    return null;
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Platform Preview</h3>
        {relevantPlatforms.length > 1 && (
          <div className="flex gap-1">
            {relevantPlatforms.map((p) => (
              <Button
                key={p.key}
                variant={ButtonVariant.GHOST}
                onClick={() => setActivePlatform(p.key)}
                className={`p-1.5 rounded ${
                  activePlatform === p.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                tooltip={p.label}
              >
                {p.icon}
              </Button>
            ))}
          </div>
        )}
      </div>

      {activePlatform === 'twitter' && (
        <TwitterPreview
          post={post}
          accountName={accountName}
          accountHandle={accountHandle}
        />
      )}
      {activePlatform === 'instagram' && (
        <InstagramPreview post={post} accountName={accountName} />
      )}
      {(activePlatform === 'facebook' || activePlatform === 'linkedin') && (
        <TwitterPreview
          post={post}
          accountName={accountName}
          accountHandle={accountHandle}
        />
      )}
    </Card>
  );
}
