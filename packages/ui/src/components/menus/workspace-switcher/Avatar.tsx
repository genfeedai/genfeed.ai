'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Image from 'next/image';

type AvatarProps = {
  label: string;
  imageUrl?: string | null;
  isActive?: boolean;
};

export function Avatar({ label, imageUrl, isActive }: AvatarProps) {
  if (imageUrl) {
    return (
      <div className="flex size-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-background">
        <Image
          src={imageUrl}
          alt={label}
          width={20}
          height={20}
          className="object-cover object-center"
          sizes="20px"
          style={{ height: 'auto', width: 'auto' }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex size-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold',
        isActive ? 'bg-primary/30 text-primary' : 'bg-white/10 text-white/60',
      )}
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}
