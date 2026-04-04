'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import PostDetail from '@pages/posts/detail/post-detail';
import Button from '@ui/buttons/base/Button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import type { PageScope } from '@ui-constants/misc.constant';
import { useRouter } from 'next/navigation';
import { HiArrowTopRightOnSquare } from 'react-icons/hi2';

export interface PostDetailOverlayProps {
  postId: string | null;
  scope: PageScope;
  onClose: () => void;
}

export default function PostDetailOverlay({
  postId,
  scope,
  onClose,
}: PostDetailOverlayProps) {
  const router = useRouter();
  const { href } = useOrgUrl();
  const isOpen = Boolean(postId);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className={cn(
          'flex h-full w-full flex-col gap-0 overflow-hidden border-l border-white/8 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_32%),linear-gradient(180deg,rgba(15,15,18,0.985),rgba(8,8,10,0.985))] p-0 shadow-[0_36px_140px_rgba(0,0,0,0.58)] sm:max-w-[min(104rem,97vw)]',
        )}
      >
        <div className="sticky top-0 z-10 border-b border-white/8 bg-background/92 px-6 pb-5 pt-6 backdrop-blur">
          <div className="flex items-start justify-between gap-4 pr-8">
            <SheetHeader className="space-y-3 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-foreground/55">
                  Post Review
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
                  In-context sheet
                </span>
              </div>
              <SheetTitle>Post detail</SheetTitle>
              <SheetDescription>
                Review, refine, and compare this post without losing the
                surrounding list context.
              </SheetDescription>
            </SheetHeader>

            {postId ? (
              <Button
                label="Open page"
                variant={ButtonVariant.SECONDARY}
                icon={<HiArrowTopRightOnSquare className="h-4 w-4" />}
                onClick={() => router.push(href(`/posts/${postId}`))}
              />
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {postId ? (
            <PostDetail postId={postId} scope={scope} presentation="overlay" />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
