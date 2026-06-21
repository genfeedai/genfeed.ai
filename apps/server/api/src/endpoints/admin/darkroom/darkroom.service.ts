import { GenerateImageDto } from '@api/endpoints/admin/darkroom/dto/generate-image.dto';
import { DarkroomAssetService } from '@api/endpoints/admin/darkroom/services/darkroom-asset.service';
import { DarkroomCharacterService } from '@api/endpoints/admin/darkroom/services/darkroom-character.service';
import { DarkroomGenerationService } from '@api/endpoints/admin/darkroom/services/darkroom-generation.service';
import { DarkroomInfraService } from '@api/endpoints/admin/darkroom/services/darkroom-infra.service';
import { DarkroomIngestService } from '@api/endpoints/admin/darkroom/services/darkroom-ingest.service';
import { DarkroomMediaService } from '@api/endpoints/admin/darkroom/services/darkroom-media.service';
import { DarkroomPublishingService } from '@api/endpoints/admin/darkroom/services/darkroom-publishing.service';
import { DarkroomStatsService } from '@api/endpoints/admin/darkroom/services/darkroom-stats.service';
import { DarkroomTrainingOrchestratorService } from '@api/endpoints/admin/darkroom/services/darkroom-training-orchestrator.service';
import { Injectable } from '@nestjs/common';

/**
 * Thin facade over the darkroom collaborator services. Preserves the public
 * surface the DarkroomController depends on while the implementation lives in
 * focused, independently-ownable peer services under `./services`.
 */
@Injectable()
export class DarkroomService {
  constructor(
    private readonly characterService: DarkroomCharacterService,
    private readonly assetService: DarkroomAssetService,
    private readonly generationService: DarkroomGenerationService,
    private readonly ingestService: DarkroomIngestService,
    private readonly trainingOrchestratorService: DarkroomTrainingOrchestratorService,
    private readonly publishingService: DarkroomPublishingService,
    private readonly mediaService: DarkroomMediaService,
    private readonly statsService: DarkroomStatsService,
    private readonly infraService: DarkroomInfraService,
  ) {}

  // === Characters ===

  getCharacters(organizationId: string) {
    return this.characterService.getCharacters(organizationId);
  }

  getCharacterBySlug(slug: string, organizationId: string) {
    return this.characterService.getCharacterBySlug(slug, organizationId);
  }

  createCharacter(
    data: Parameters<DarkroomCharacterService['createCharacter']>[0],
  ) {
    return this.characterService.createCharacter(data);
  }

  updateCharacter(
    id: string,
    data: Parameters<DarkroomCharacterService['updateCharacter']>[1],
  ) {
    return this.characterService.updateCharacter(id, data);
  }

  // === Assets ===

  getAssets(
    organizationId: string,
    filters: Parameters<DarkroomAssetService['getAssets']>[1],
  ) {
    return this.assetService.getAssets(organizationId, filters);
  }

  reviewAsset(
    ingredientId: string,
    organizationId: string,
    reviewStatus: Parameters<DarkroomAssetService['reviewAsset']>[2],
  ) {
    return this.assetService.reviewAsset(
      ingredientId,
      organizationId,
      reviewStatus,
    );
  }

  publishAsset(
    ingredientId: string,
    organizationId: string,
    brandId: string,
    platforms: string[],
    caption?: string,
  ) {
    return this.publishingService.publishAsset(
      ingredientId,
      organizationId,
      brandId,
      platforms,
      caption,
    );
  }

  // === Generation ===

  generateImage(
    organizationId: string,
    brandId: string,
    userId: string,
    personaSlug: string,
    prompt: string,
    options: Parameters<DarkroomGenerationService['generateImage']>[5],
  ) {
    return this.generationService.generateImage(
      organizationId,
      brandId,
      userId,
      personaSlug,
      prompt,
      options,
    );
  }

  createGenerationJob(
    organizationId: string,
    brandId: string,
    userId: string,
    dto: GenerateImageDto,
  ) {
    return this.generationService.createGenerationJob(
      organizationId,
      brandId,
      userId,
      dto,
    );
  }

  getGenerationJob(jobId: string, organizationId: string) {
    return this.generationService.getGenerationJob(jobId, organizationId);
  }

  // === Training Data Ingestion ===

  uploadDataset(
    organizationId: string,
    slug: string,
    files: Parameters<DarkroomIngestService['uploadDataset']>[2],
    captions?: Parameters<DarkroomIngestService['uploadDataset']>[3],
  ) {
    return this.ingestService.uploadDataset(
      organizationId,
      slug,
      files,
      captions,
    );
  }

  ingestTrainingDataForCharacter(
    organizationId: string,
    userId: string,
    slug: string,
  ) {
    return this.ingestService.ingestTrainingDataForCharacter(
      organizationId,
      userId,
      slug,
    );
  }

  ingestTrainingDataForAllEnabledCharacters(
    organizationId: string,
    userId: string,
  ) {
    return this.ingestService.ingestTrainingDataForAllEnabledCharacters(
      organizationId,
      userId,
    );
  }

  // === Training ===

  getTrainings(organizationId: string, personaSlug?: string) {
    return this.trainingOrchestratorService.getTrainings(
      organizationId,
      personaSlug,
    );
  }

  getTraining(trainingId: string, organizationId: string) {
    return this.trainingOrchestratorService.getTraining(
      trainingId,
      organizationId,
    );
  }

  startTraining(
    organizationId: string,
    userId: string,
    _brandId: string,
    data: Parameters<DarkroomTrainingOrchestratorService['startTraining']>[2],
  ) {
    return this.trainingOrchestratorService.startTraining(
      organizationId,
      userId,
      data,
    );
  }

  // === Pipeline Stats & Campaigns ===

  listCampaigns(organizationId: string) {
    return this.statsService.listCampaigns(organizationId);
  }

  getPipelineStats(organizationId: string) {
    return this.statsService.getPipelineStats(organizationId);
  }

  // === Lip Sync ===

  generateLipSync(
    organizationId: string,
    data: Parameters<DarkroomMediaService['generateLipSync']>[1],
  ) {
    return this.mediaService.generateLipSync(organizationId, data);
  }

  getLipSyncStatus(jobId: string) {
    return this.mediaService.getLipSyncStatus(jobId);
  }

  // === Voices / TTS ===

  getVoices() {
    return this.mediaService.getVoices();
  }

  generateVoice(
    organizationId: string,
    data: Parameters<DarkroomMediaService['generateVoice']>[1],
  ) {
    return this.mediaService.generateVoice(organizationId, data);
  }

  // === Infrastructure ===

  getServiceHealth() {
    return this.infraService.getServiceHealth();
  }

  getEC2Status() {
    return this.infraService.getEC2Status();
  }

  ec2Action(
    instanceId: string,
    action: Parameters<DarkroomInfraService['ec2Action']>[1],
  ) {
    return this.infraService.ec2Action(instanceId, action);
  }

  ec2ActionAll(
    action: Parameters<DarkroomInfraService['ec2ActionAll']>[0],
    role?: string,
  ) {
    return this.infraService.ec2ActionAll(action, role);
  }

  invalidateCloudFront(distributionId: string, paths?: string[]) {
    return this.infraService.invalidateCloudFront(distributionId, paths);
  }

  getDefaultCloudFrontDistributionId(): string {
    return this.infraService.getDefaultCloudFrontDistributionId();
  }
}
