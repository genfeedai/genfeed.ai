#!/usr/bin/env bun

/**
 * Simple FAL.AI Integration Test
 * Tests basic functionality without complex service dependencies
 */

import { MODEL_KEYS } from '@genfeedai/constants';
import { ModelProvider } from '@genfeedai/enums';
import { Logger } from '@nestjs/common';

const logger = new Logger('FalIntegrationTest');

logger.log('🧪 Testing FAL.AI Integration...\n');

// Test 1: Enum additions
logger.log('✅ Testing Enum Integration:');
logger.log(`   FAL Provider: ${ModelProvider.FAL}`);
logger.log(`   Sample FAL Model: ${MODEL_KEYS.FAL_FLUX_DEV}`);
logger.log('');

// Test 2: FAL Provider Service
logger.log('📦 Testing FAL Provider Service:');

try {
  const { FalProviderService } = await import(
    '../../packages/services/ai/providers/fal/fal-provider.service'
  );

  const provider = new FalProviderService();
  logger.log(`   ✅ FalProviderService loaded`);
  logger.log(`   ✅ Configured: ${provider.isConfigured()}`);

  // Test predefined models
  const predefinedModels = provider.getPredefinedModels();
  logger.log(`   ✅ Predefined models: ${predefinedModels.length}`);

  if (predefinedModels.length > 0) {
    const sample = predefinedModels[0];
    logger.log(`   📋 Sample Model:`);
    logger.log(`      Name: ${sample.label}`);
    logger.log(`      Key: ${sample.key}`);
    logger.log(`      Category: ${sample.category}`);
    logger.log(`      Cost: $${sample.cost}`);
  }
} catch (error) {
  logger.log(`   ❌ Error: ${(error as Error).message}`);
}

logger.log('');

// Test 3: API Key Check
logger.log('🔑 Testing API Key Configuration:');
const apiKey = process.env.FAL_API_KEY;
if (apiKey) {
  logger.log(`   ✅ FAL_API_KEY found (${apiKey.substring(0, 8)}...)`);

  // Test actual API call if key is present
  try {
    logger.log('   🌐 Testing API connection...');
    const response = await fetch('https://fal.ai/api/models', {
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      logger.log('   ✅ API connection successful');
      const data = await response.json();
      const availableModels =
        (Array.isArray(data?.items) && data.items.length) ||
        data?.total ||
        data?.models?.length ||
        'unknown';
      logger.log(`   📊 Available models: ${availableModels}`);
    } else {
      logger.log(`   ⚠️  API responded with status: ${response.status}`);
    }
  } catch (error) {
    logger.log(`   ❌ API connection failed: ${(error as Error).message}`);
  }
} else {
  logger.log('   ⚠️  FAL_API_KEY not set');
  logger.log('   💡 Set it with: export FAL_API_KEY="your-key"');
}

logger.log('');

// Test 4: Model Constants
logger.log('📊 Testing Model Constants:');
try {
  const { MODEL_OUTPUT_CAPABILITIES } = await import('@genfeedai/constants');

  // Check if our FAL models are in the capabilities
  const falFluxCapability = MODEL_OUTPUT_CAPABILITIES[MODEL_KEYS.FAL_FLUX_DEV];
  if (falFluxCapability) {
    logger.log('   ✅ FAL model capabilities loaded');
    logger.log(
      `   📋 FLUX Dev: ${falFluxCapability.category}, max outputs: ${falFluxCapability.maxOutputs}`,
    );
  } else {
    logger.log('   ⚠️  FAL model capabilities not found');
  }
} catch (error) {
  logger.log(`   ❌ Constants error: ${(error as Error).message}`);
}

logger.log('');
logger.log('🎉 Integration test completed!');
logger.log('');

// Show next steps
logger.log('📋 Next Steps:');
logger.log('   1. Set FAL_API_KEY if not already set');
logger.log('   2. Run: bun run fal:discover');
logger.log('   3. Run: bun run fal:stats');
logger.log('   4. Add models with: bun run fal:add');
