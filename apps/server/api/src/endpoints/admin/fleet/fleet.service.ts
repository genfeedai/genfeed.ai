import { GenerateImageDto } from '@api/endpoints/admin/fleet/dto/generate-image.dto';
import { AdminFleetAssetService } from '@api/endpoints/admin/fleet/services/fleet-asset.service';
import { AdminFleetCharacterService } from '@api/endpoints/admin/fleet/services/fleet-character.service';
import { AdminFleetGenerationService } from '@api/endpoints/admin/fleet/services/fleet-generation.service';
import { AdminFleetInfraService } from '@api/endpoints/admin/fleet/services/fleet-infra.service';
import { AdminFleetIngestService } from '@api/endpoints/admin/fleet/services/fleet-ingest.service';
import { AdminFleetMediaService } from '@api/endpoints/admin/fleet/services/fleet-media.service';
import { AdminFleetPublishingService } from '@api/endpoints/admin/fleet/services/fleet-publishing.service';
import { AdminFleetStatsService } from '@api/endpoints/admin/fleet/services/fleet-stats.service';
import { AdminFleetTrainingOrchestratorService } from '@api/endpoints/admin/fleet/services/fleet-training-orchestrator.service';
import { Injectable } from '@nestjs/common';

/**
 * Thin facade over the fleet collaborator services. Preserves the public
 * surface the AdminFleetController depends on while the implementation lives in
 * focused, independently-ownable peer services under `./services`.
 */
@Injectable()
export class AdminFleetService {
  constructor(
    private readonly characterService: AdminFleetCharacterService,
    private readonly assetService: AdminFleetAssetService,
    private readonly generationService: AdminFleetGenerationService,
    private readonly ingestService: AdminFleetIngestService,
    private readonly trainingOrchestratorService: AdminFleetTrainingOrchestratorService,
    private readonly publishingService: AdminFleetPublishingService,
    private readonly mediaService: AdminFleetMediaService,
    private readonly statsService: AdminFleetStatsService,
    private readonly infraService: AdminFleetInfraService,
  ) {}

  // === Characters ===

  getCharacters(organizationId: string) {
    return this.characterService.getCharacters(organizationId);
  }

  getCharacterBySlug(slug: string, organizationId: string) {
    return this.characterService.getCharacterBySlug(slug, organizationId);
  }

  createCharacter(
    data: Parameters<AdminFleetCharacterService['createCharacter']>[0],
  ) {
    return this.characterService.createCharacter(data);
  }

  updateCharacter(
    id: string,
    data: Parameters<AdminFleetCharacterService['updateCharacter']>[1],
  ) {
    return this.characterService.updateCharacter(id, data);
  }

  // === Assets ===

  getAssets(
    organizationId: string,
    filters: Parameters<AdminFleetAssetService['getAssets']>[1],
  ) {
    return this.assetService.getAssets(organizationId, filters);
  }

  reviewAsset(
    ingredientId: string,
    organizationId: string,
    reviewStatus: Parameters<AdminFleetAssetService['reviewAsset']>[2],
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
    options: Parameters<AdminFleetGenerationService['generateImage']>[5],
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
    files: Parameters<AdminFleetIngestService['uploadDataset']>[2],
    captions?: Parameters<AdminFleetIngestService['uploadDataset']>[3],
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
    data: Parameters<AdminFleetTrainingOrchestratorService['startTraining']>[2],
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
    data: Parameters<AdminFleetMediaService['generateLipSync']>[1],
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
    data: Parameters<AdminFleetMediaService['generateVoice']>[1],
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
    action: Parameters<AdminFleetInfraService['ec2Action']>[1],
  ) {
    return this.infraService.ec2Action(instanceId, action);
  }

  ec2ActionAll(
    action: Parameters<AdminFleetInfraService['ec2ActionAll']>[0],
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
