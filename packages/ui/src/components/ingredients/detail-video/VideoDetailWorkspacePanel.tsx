'use client';

import type { IEvaluation } from '@genfeedai/client/models';
import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient, ITag, IVideo } from '@genfeedai/interfaces';
import type { TabItem } from '@genfeedai/props/ui/navigation/tabs.props';
import { logger } from '@genfeedai/services/core/logger.service';
import EvaluationCard from '@ui/evaluation/card/EvaluationCard';
import IngredientWorkspacePanel from '@ui/ingredients/detail/shared/IngredientWorkspacePanel';
import IngredientTabsCaptions from '@ui/ingredients/tabs/captions/IngredientTabsCaptions';
import IngredientTabsChildren from '@ui/ingredients/tabs/children/IngredientTabsChildren';
import IngredientTabsInfo from '@ui/ingredients/tabs/info/IngredientTabsInfo';
import IngredientTabsMetadata from '@ui/ingredients/tabs/metadata/IngredientTabsMetadata';
import IngredientTabsPosts from '@ui/ingredients/tabs/posts/IngredientTabsPosts';
import IngredientTabsPrompts from '@ui/ingredients/tabs/prompts/IngredientTabsPrompts';
import IngredientTabsSharing from '@ui/ingredients/tabs/sharing/IngredientTabsSharing';
import IngredientTabsTags from '@ui/ingredients/tabs/tags/IngredientTabsTags';

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
  onReload?: (skipNotification?: boolean) => Promise<void>;
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
    <div className="col-span-2 space-y-4">
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
              onReload?.(true);
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
