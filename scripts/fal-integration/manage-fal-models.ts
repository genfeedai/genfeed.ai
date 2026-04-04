#!/usr/bin/env ts-node

/**
 * FAL.AI Model Management CLI
 *
 * Usage:
 *   bun run scripts/fal-integration/manage-fal-models.ts <command> [options]
 *
 * Commands:
 *   discover     - Discover available fal.ai models
 *   sync         - Sync existing fal.ai model pricing
 *   add          - Add new discovered models to database
 *   stats        - Show model statistics
 *   test         - Test fal.ai API connection
 *
 * Options:
 *   --dry-run    - Preview changes without applying them
 *   --provider   - Filter by provider (replicate|fal)
 *   --category   - Filter by category
 *   --limit      - Limit number of results
 */

const logger = {
  error(message: string, details?: string) {
    console.error(`[FalModelManager] ${message}`, details ?? '');
  },
  log(message: string) {
    console.log(message);
  },
};

interface CliOptions {
  command: string;
  dryRun?: boolean;
  provider?: string;
  category?: string;
  limit?: number;
  token?: string;
  falApiKey?: string;
}

interface FalCatalogItem {
  category?: string;
  deprecated?: boolean;
  id: string;
  pricingInfoOverride?: string;
  removed?: boolean;
  shortDescription?: string;
  title?: string;
}

interface CliFalModel {
  category: string;
  cost: number;
  description: string;
  key: string;
  label: string;
  provider: 'fal';
}

class FalModelManager {
  private enhancedModelsServicePromise: Promise<{
    addDiscoveredFalModels(): Promise<{ added: number; errors: string[] }>;
    getAllModels(options?: {
      includeInactive?: boolean;
      includeDynamic?: boolean;
    }): Promise<Array<{ key: string }>>;
    getFalModels(): Promise<
      Array<{
        category?: string;
        cost?: number;
        description?: string;
        key?: string;
        label?: string;
      }>
    >;
    getModelStats(): Promise<{
      byCategory: Record<string, number>;
      byProvider: Record<string, number>;
      falConfigured: boolean;
      lastSync?: Date;
      total: number;
    }>;
    initialize(config?: { falApiKey?: string }): Promise<void>;
    syncFalPricing(): Promise<{ updated: number; errors: string[] }>;
  }> | null = null;

  constructor(private options: CliOptions) {}

  async run(): Promise<void> {
    try {
      switch (this.options.command) {
        case 'discover':
          await this.discoverModels();
          break;
        case 'sync':
          await this.syncPricing();
          break;
        case 'add':
          await this.addNewModels();
          break;
        case 'stats':
          await this.showStats();
          break;
        case 'test':
          await this.testConnection();
          break;
        default:
          this.showHelp();
      }
    } catch (error) {
      logger.error('❌ Command failed:', error.message);
      process.exit(1);
    }
  }

  private async discoverModels(): Promise<void> {
    logger.log('🔍 Discovering fal.ai models...\n');

    const falModels = await this.getFalModels();

    if (falModels.length === 0) {
      logger.log(
        'No fal.ai models found. Check your FAL_API_KEY configuration.',
      );
      return;
    }

    logger.log(`Found ${falModels.length} fal.ai models:\n`);

    for (const model of falModels.slice(0, this.options.limit || 20)) {
      logger.log(`📦 ${model.label}`);
      logger.log(`   Key: ${model.key}`);
      logger.log(`   Category: ${model.category}`);
      logger.log(`   Cost: ${this.formatCredits(model.cost)}`);
      logger.log(`   Description: ${model.description}`);
      logger.log('');
    }

    if (falModels.length > (this.options.limit || 20)) {
      logger.log(
        `... and ${falModels.length - (this.options.limit || 20)} more models`,
      );
      logger.log('Use --limit option to see more results');
    }
  }

  private async syncPricing(): Promise<void> {
    logger.log('💰 Syncing fal.ai model pricing...\n');

    if (this.options.dryRun) {
      logger.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    const enhancedModelsService = await this.getEnhancedModelsService();
    const result = await enhancedModelsService.syncFalPricing();

    logger.log(`✅ Pricing sync completed:`);
    logger.log(`   Updated: ${result.updated} models`);
    logger.log(`   Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      logger.log('\n❌ Errors:');
      for (const error of result.errors) {
        logger.log(`   ${error}`);
      }
    }
  }

  private async addNewModels(): Promise<void> {
    logger.log('➕ Adding new fal.ai models to database...\n');

    if (this.options.dryRun) {
      logger.log('🔍 DRY RUN MODE - No changes will be made\n');

      // Show what would be added
      const enhancedModelsService = await this.getEnhancedModelsService();
      const existingModels = await enhancedModelsService.getAllModels({
        includeDynamic: false,
      });
      const existingKeys = new Set(existingModels.map((m) => m.key));
      const falModels = await enhancedModelsService.getFalModels();
      const newModels = falModels.filter(
        (m) => m.key && !existingKeys.has(m.key),
      );

      logger.log(`Would add ${newModels.length} new models:`);
      for (const model of newModels) {
        logger.log(`   + ${model.label} (${model.category})`);
      }
      return;
    }

    const enhancedModelsService = await this.getEnhancedModelsService();
    const result = await enhancedModelsService.addDiscoveredFalModels();

    logger.log(`✅ Model addition completed:`);
    logger.log(`   Added: ${result.added} models`);
    logger.log(`   Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      logger.log('\n❌ Errors:');
      for (const error of result.errors) {
        logger.log(`   ${error}`);
      }
    }
  }

  private async showStats(): Promise<void> {
    logger.log('📊 Model Statistics\n');

    const byCategory: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    const allModels = await this.getFalModels();

    for (const model of allModels) {
      if (model.category) {
        byCategory[model.category] = (byCategory[model.category] || 0) + 1;
      }
      if (model.provider) {
        byProvider[model.provider] = (byProvider[model.provider] || 0) + 1;
      }
    }

    logger.log(`Total Models: ${allModels.length}`);
    logger.log(`FAL API Configured: ${this.isConfigured() ? '✅' : '❌'}`);
    logger.log(`Last Sync: Never\n`);

    logger.log('By Provider:');
    for (const [provider, count] of Object.entries(byProvider)) {
      const emoji = provider === 'fal' ? '🟢' : '🔵';
      logger.log(`   ${emoji} ${provider}: ${count} models`);
    }

    logger.log('\nBy Category:');
    for (const [category, count] of Object.entries(byCategory)) {
      const emoji = this.getCategoryEmoji(category);
      logger.log(`   ${emoji} ${category}: ${count} models`);
    }
  }

  private async testConnection(): Promise<void> {
    logger.log('🔗 Testing fal.ai API connection...\n');

    try {
      const falModels = await this.getFalModels();

      if (falModels.length > 0) {
        logger.log('✅ Connection successful!');
        logger.log(`   Found ${falModels.length} models`);
        logger.log(`   Sample model: ${falModels[0]?.label || 'Unknown'}`);
      } else {
        logger.log('⚠️  Connection established but no models found');
        logger.log('   Check your FAL_API_KEY permissions');
      }
    } catch (error) {
      logger.log('❌ Connection failed:');
      logger.log(`   ${error.message}`);
    }
  }

  private getCategoryEmoji(category: string): string {
    const emojiMap: Record<string, string> = {
      embedding: '🧮',
      image: '🖼️',
      'image-edit': '✏️',
      'image-upscale': '🔍',
      music: '🎵',
      text: '📝',
      video: '🎥',
      'video-edit': '🎬',
      'video-upscale': '📈',
      voice: '🗣️',
    };
    return emojiMap[category] || '📦';
  }

  private formatCredits(cost?: number): string {
    if (typeof cost !== 'number' || Number.isNaN(cost)) {
      return 'N/A';
    }

    const usdEquivalent = cost / 100;
    return `${cost.toFixed(4)} credits (~$${usdEquivalent.toFixed(4)})`;
  }

  private async getFalModels(): Promise<CliFalModel[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const models = await this.fetchFalCatalog();
    return models.map((model) => ({
      category: model.category || 'other',
      cost: this.extractCredits(model),
      description: model.shortDescription || 'No description available',
      key: model.id,
      label: model.title || model.id,
      provider: 'fal',
    }));
  }

  private async fetchFalCatalog(): Promise<FalCatalogItem[]> {
    const apiKey = this.getFalApiKey();
    const allModels: FalCatalogItem[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await fetch(
        `https://fal.ai/api/models?page=${page}&size=200`,
        {
          headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`fal.ai API responded with status ${response.status}`);
      }

      const data = (await response.json()) as {
        items?: FalCatalogItem[];
        pages?: number;
      };

      const pageItems = Array.isArray(data.items) ? data.items : [];
      allModels.push(
        ...pageItems.filter(
          (model) =>
            model.id.startsWith('fal-ai/') &&
            !model.deprecated &&
            !model.removed,
        ),
      );

      totalPages = Math.max(data.pages || 1, 1);
      page += 1;
    }

    return allModels;
  }

  private extractCredits(model: FalCatalogItem): number {
    const pricingText = model.pricingInfoOverride || '';
    const match = pricingText.match(/\$([0-9]*\.?[0-9]+)/);
    const providerCostUsd = match ? Number.parseFloat(match[1] || '0') : 0;

    if (!providerCostUsd || Number.isNaN(providerCostUsd)) {
      return 2;
    }

    const credits = providerCostUsd / 0.3 / 0.01;
    return Number.parseFloat(credits.toFixed(4));
  }

  private getFalApiKey(): string {
    return this.options.falApiKey || process.env.FAL_API_KEY || '';
  }

  private isConfigured(): boolean {
    return this.getFalApiKey().length > 0;
  }

  private showHelp(): void {
    logger.log(`
FAL.AI Model Management CLI

Usage:
  bun run scripts/fal-integration/manage-fal-models.ts <command> [options]

Commands:
  discover     Discover available fal.ai models
  sync         Sync existing fal.ai model pricing
  add          Add new discovered models to database
  stats        Show model statistics
  test         Test fal.ai API connection

Options:
  --dry-run    Preview changes without applying them
  --limit N    Limit number of results (default: 20)
  --provider   Filter by provider (replicate|fal)
  --category   Filter by category

Environment Variables:
  FAL_API_KEY         Your fal.ai API key
  GENFEED_API_TOKEN   GenFeed.AI API token

Examples:
  # Test connection
  bun run scripts/fal-integration/manage-fal-models.ts test

  # Discover first 10 models
  bun run scripts/fal-integration/manage-fal-models.ts discover --limit 10

  # Sync pricing (dry run)
  bun run scripts/fal-integration/manage-fal-models.ts sync --dry-run

  # Add new models
  bun run scripts/fal-integration/manage-fal-models.ts add

  # Show statistics
  bun run scripts/fal-integration/manage-fal-models.ts stats
`);
  }

  private async getEnhancedModelsService(): Promise<{
    addDiscoveredFalModels(): Promise<{ added: number; errors: string[] }>;
    getAllModels(options?: {
      includeInactive?: boolean;
      includeDynamic?: boolean;
    }): Promise<Array<{ key: string }>>;
    getFalModels(): Promise<
      Array<{
        category?: string;
        cost?: number;
        description?: string;
        key?: string;
        label?: string;
      }>
    >;
    getModelStats(): Promise<{
      byCategory: Record<string, number>;
      byProvider: Record<string, number>;
      falConfigured: boolean;
      lastSync?: Date;
      total: number;
    }>;
    initialize(config?: { falApiKey?: string }): Promise<void>;
    syncFalPricing(): Promise<{ updated: number; errors: string[] }>;
  }> {
    if (!this.enhancedModelsServicePromise) {
      this.enhancedModelsServicePromise = (async () => {
        const token =
          this.options.token || process.env.GENFEED_API_TOKEN || 'dev-token';
        const { EnhancedModelsService } = await import(
          '../../packages/services/ai/enhanced-models.service'
        );
        const service = new EnhancedModelsService(token);
        await service.initialize({
          falApiKey: this.options.falApiKey || process.env.FAL_API_KEY,
        });
        return service;
      })();
    }

    return this.enhancedModelsServicePromise;
  }
}

// Parse command line arguments
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    command: args[0] || 'help',
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--provider' && args[i + 1]) {
      options.provider = args[i + 1] as ModelProvider;
      i++;
    } else if (arg === '--category' && args[i + 1]) {
      options.category = args[i + 1] as ModelCategory;
      i++;
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--token' && args[i + 1]) {
      options.token = args[i + 1];
      i++;
    } else if (arg === '--fal-key' && args[i + 1]) {
      options.falApiKey = args[i + 1];
      i++;
    }
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  const manager = new FalModelManager(options);
  manager.run().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export { FalModelManager };
