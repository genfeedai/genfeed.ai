'use client';

import type { IEvaluation } from '@genfeedai/client/models';
import { IngredientCategory } from '@genfeedai/contracts';
import type {
  IIngredient,
  ITag,
  IVideo,
  TabItem,
} from '@genfeedai/contracts/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import EvaluationCard from '@/components/evaluation/card/EvaluationCard';
import IngredientWorkspacePanel from '@/features/ingredients/components/detail/shared/IngredientWorkspacePanel';
import IngredientTabsPrompts from '@/features/ingredients/components/ingredients/tabs/prompts/IngredientTabsPrompts';
import IngredientTabsCaptions from '@/features/ingredients/components/tabs/captions/IngredientTabsCaptions';
import IngredientTabsChildren from '@/features/ingredients/components/tabs/children/IngredientTabsChildren';
import IngredientTabsInfo from '@/features/ingredients/components/tabs/info/IngredientTabsInfo';
import IngredientTabsMetadata from '@/features/ingredients/components/tabs/metadata/IngredientTabsMetadata';
import IngredientTabsSharing from '@/features/ingredients/components/tabs/sharing/IngredientTabsSharing';
import IngredientTabsTags from '@/features/ingredients/components/tabs/tags/IngredientTabsTags';
import IngredientTabsPosts from '@/features/ingredients/tabs-posts/IngredientTabsPosts';

type VideoDetailTab =
  | 'info'
  | 'posts'
  | 'metadata'
  | 'prompts'
  | 'children'
  | 'captions'
  | 'tags'
  | 'sharing'
  | 'evaluation';

type VideoDetailWorkspacePanelProps = {
  currentVideo: IVideo;
  tabs: TabItem[];
  tab: VideoDetailTab;
  onTabChange: (tab: VideoDetailTab) => void;
  isUpdating: boolean;
  evaluation: IEvaluation | undefined;
  isEvaluating: boolean;
  onEvaluate: () => Promise<void>;
  onReload?: () => Promise<void>;
  updateMetadataHook: (
    field: string,
    value: string,
  ) => Promise<void | IIngredient>;
  updateSharingHook: (
    field: string,
    value: boolean | string,
  ) => Promise<void | IIngredient>;
  handleRefreshMetadata: () => Promise<IVideo>;
  onSeeDetails?: (video: IVideo) => void;
};

export default function VideoDetailWorkspacePanel({
  currentVideo,
  tabs,
  tab,
  onTabChange,
  isUpdating,
  evaluation,
  isEvaluating,
  onEvaluate,
  onReload,
  updateMetadataHook,
  updateSharingHook,
  handleRefreshMetadata,
  onSeeDetails,
}: VideoDetailWorkspacePanelProps) {
  return (
    <div className="min-w-0 space-y-4">
      <IngredientWorkspacePanel
        title="Review video details"
        tabs={tabs}
        activeTab={tab}
        onTabChange={(nextTab) => onTabChange(nextTab as VideoDetailTab)}
      >
        {tab === 'info' && (
          <IngredientTabsInfo
            ingredient={currentVideo}
            isUpdating={isUpdating}
            onUpdateMetadata={updateMetadataHook}
          />
        )}

        {tab === 'evaluation' && (
          <EvaluationCard
            contentId={currentVideo.id}
            contentType={IngredientCategory.VIDEO}
            evaluation={evaluation ?? undefined}
            onEvaluate={onEvaluate}
            isEvaluating={isEvaluating}
          />
        )}

        {tab === 'posts' && <IngredientTabsPosts ingredient={currentVideo} />}

        {tab === 'metadata' && (
          <IngredientTabsMetadata
            ingredient={currentVideo}
            onRefresh={async () => {
              await handleRefreshMetadata();
            }}
          />
        )}

        {tab === 'prompts' && (
          <IngredientTabsPrompts ingredient={currentVideo} />
        )}

        {tab === 'children' && (
          <IngredientTabsChildren
            ingredient={currentVideo}
            onViewChild={(child) => {
              logger.info('View child', { childId: child.id });
              if (onSeeDetails) {
                onSeeDetails(child as IVideo);
              }
            }}
          />
        )}

        {tab === 'captions' && (
          <IngredientTabsCaptions
            ingredient={currentVideo}
            onReload={onReload}
          />
        )}

        {tab === 'tags' && (
          <IngredientTabsTags
            ingredient={currentVideo}
            onTagsUpdate={(tags: ITag[]) => {
              logger.info('Tags updated', { tags });
              onReload?.();
            }}
          />
        )}

        {tab === 'sharing' && (
          <IngredientTabsSharing
            ingredient={currentVideo}
            onUpdateSharing={updateSharingHook}
            isUpdating={isUpdating}
          />
        )}
      </IngredientWorkspacePanel>
    </div>
  );
}
