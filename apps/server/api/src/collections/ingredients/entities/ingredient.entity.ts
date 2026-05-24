import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { type Ingredient } from '@genfeedai/prisma';

export class IngredientEntity extends BaseEntity implements Ingredient {
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly userId: string;
  declare readonly organizationId: string;
  declare readonly brandId: string | null;
  declare readonly folderId: string | null;
  declare readonly parentId: string | null;
  declare readonly metadataId: string | null;
  declare readonly promptId: string | null;
  declare readonly trainingId: string | null;
  declare readonly bookmarkId: string | null;
  declare readonly personaId: string | null;
  declare readonly agentRunId: string | null;
  declare readonly agentStrategyId: string | null;
  declare readonly user: string;
  declare readonly metadata: string;
  declare readonly organization: string;
  declare readonly brand: string;
  declare readonly folder?: string;

  declare readonly votes?: string[];
  declare readonly parent?: string;
  declare readonly prompt?: string;
  declare readonly tags: string[];
  declare readonly sources?: string[];
  declare readonly training?: string;
  declare readonly groupId: Ingredient['groupId'];
  declare readonly groupIndex: Ingredient['groupIndex'];
  declare readonly isMergeEnabled: Ingredient['isMergeEnabled'];
  declare readonly promptTemplate: Ingredient['promptTemplate'];
  declare readonly templateVersion: Ingredient['templateVersion'];
  declare readonly s3Key: Ingredient['s3Key'];
  declare readonly cdnUrl: Ingredient['cdnUrl'];
  declare readonly personaSlug: Ingredient['personaSlug'];
  declare readonly contentRating: Ingredient['contentRating'];
  declare readonly reviewStatus: Ingredient['reviewStatus'];
  declare readonly assetLabel: Ingredient['assetLabel'];
  declare readonly generationSource: Ingredient['generationSource'];
  declare readonly campaign: Ingredient['campaign'];
  declare readonly campaignWeek: Ingredient['campaignWeek'];
  declare readonly modelUsed: Ingredient['modelUsed'];
  declare readonly loraUsed: Ingredient['loraUsed'];
  declare readonly generationPrompt: Ingredient['generationPrompt'];
  declare readonly negativePrompt: Ingredient['negativePrompt'];
  declare readonly generationSeed: Ingredient['generationSeed'];
  declare readonly cfgScale: Ingredient['cfgScale'];
  declare readonly generationSteps: Ingredient['generationSteps'];
  declare readonly workflowUsed: Ingredient['workflowUsed'];
  declare readonly generationStage: Ingredient['generationStage'];
  declare readonly generationProgress: Ingredient['generationProgress'];
  declare readonly generationError: Ingredient['generationError'];
  declare readonly generationStartedAt: Ingredient['generationStartedAt'];
  declare readonly generationCompletedAt: Ingredient['generationCompletedAt'];
  declare readonly fileSize: Ingredient['fileSize'];
  declare readonly mimeType: Ingredient['mimeType'];
  declare readonly postedTo: Ingredient['postedTo'];
  declare readonly qualityScore: Ingredient['qualityScore'];
  declare readonly qualityFeedback: Ingredient['qualityFeedback'];

  declare readonly category: Ingredient['category'];
  declare readonly status: Ingredient['status'];
  declare readonly scope: Ingredient['scope'];
  declare readonly transformations: Ingredient['transformations'];
  declare readonly order: number;
  declare readonly version: number;
  declare readonly qualityStatus: Ingredient['qualityStatus'];

  declare readonly isFavorite: boolean;
  declare readonly isHighlighted: boolean;
  declare readonly isDefault: boolean;
  declare readonly isPublic: boolean; // For public gallery visibility (getshareable.app)

  declare readonly totalVotes?: number;
  declare readonly totalChildren?: number;
  declare readonly voiceSource: Ingredient['voiceSource'];
  declare readonly voiceProvider: Ingredient['voiceProvider'];
  declare readonly externalVoiceId: Ingredient['externalVoiceId'];
  declare readonly cloneStatus: Ingredient['cloneStatus'];
  declare readonly sampleAudioUrl: Ingredient['sampleAudioUrl'];
  declare readonly isCloned: Ingredient['isCloned'];
  declare readonly isVoiceActive: Ingredient['isVoiceActive'];
  declare readonly isDefaultSelectable: Ingredient['isDefaultSelectable'];
  declare readonly providerData: Ingredient['providerData'];
  declare readonly isFeatured: Ingredient['isFeatured'];
  declare readonly language: Ingredient['language'];

  hasVoted?: boolean;
}
