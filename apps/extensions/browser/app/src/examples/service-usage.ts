/**
 * Example usage of the extension services
 * This file demonstrates how to use the refactored service architecture
 * aligned with genfeed.ai patterns
 */

import {
  authService,
  EnvironmentService,
  generatePostReply,
  type Image,
  ImagesService,
  type Music,
  MusicsService,
  PromptsService,
  type Video,
  VideosService,
} from '~services';

/**
 * Example: Using the environment service to check configuration
 */
export function checkEnvironment() {
  console.log('API Endpoint:', EnvironmentService.apiEndpoint);
  console.log('Environment:', EnvironmentService.environment);
  console.log('Is Production:', EnvironmentService.isProduction);
  console.log('Is Development:', EnvironmentService.isDevelopment);
}

/**
 * Example: Authentication and getting token
 */
export async function authenticateUser() {
  const isAuthed = await authService.isAuthenticated();

  if (!isAuthed) {
    console.log('User is not authenticated');
    return null;
  }

  const token = await authService.getToken();
  console.log('User token retrieved:', token ? 'Yes' : 'No');

  return token;
}

/**
 * Example: Generate a tweet reply using singleton pattern
 */
export async function generateTweetReply(postId: string, url: string) {
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  // Method 1: Using convenience function
  const reply1 = await generatePostReply(postId, url, token);
  console.log('Generated reply (convenience):', reply1);

  // Method 2: Using service instance directly
  const promptsService = PromptsService.getInstance(token);
  const reply2 = await promptsService.generatePostReply(postId, url);
  console.log('Generated reply (service):', reply2);

  return reply2;
}

/**
 * Example: Fetch latest images with typed responses
 */
export async function fetchLatestImages(limit: number = 10) {
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const imagesService = ImagesService.getInstance(token);
  const images: Image[] = await imagesService.getLatest(limit);

  console.log(`Fetched ${images.length} images`);
  images.forEach((img) => {
    console.log(`- Image ID: ${img.id}, URL: ${img.url}`);
  });

  return images;
}

/**
 * Example: Fetch specific image by ID
 */
export async function fetchImageById(imageId: string) {
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const imagesService = ImagesService.getInstance(token);
  const image: Image = await imagesService.getById(imageId);

  console.log('Fetched image:', image);
  return image;
}

/**
 * Example: Fetch videos with pagination
 */
export async function fetchVideos(page: number = 1, limit: number = 10) {
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const videosService = VideosService.getInstance(token);
  const videos: Video[] = await videosService.getAll({ limit, page });

  console.log(`Fetched page ${page} with ${videos.length} videos`);
  return videos;
}

/**
 * Example: Fetch music with search
 */
export async function searchMusic(searchTerm: string) {
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const musicsService = MusicsService.getInstance(token);
  const music: Music[] = await musicsService.getAll({
    limit: 20,
    search: searchTerm,
  });

  console.log(`Found ${music.length} music tracks matching "${searchTerm}"`);
  return music;
}

/**
 * Example: Service instance caching
 * Same token = same instance (performance optimization)
 */
export async function demonstrateInstanceCaching() {
  const token = await authService.getToken();
  if (!token) {
    return;
  }

  const instance1 = PromptsService.getInstance(token);
  const instance2 = PromptsService.getInstance(token);

  console.log('Same instance?', instance1 === instance2); // true

  // Different token = different instance (security)
  const differentToken = 'different-token';
  const instance3 = PromptsService.getInstance(differentToken);

  console.log('Different instance?', instance1 === instance3); // true
}

/**
 * Example: Error handling
 */
export async function handleServiceErrors() {
  const token = await authService.getToken();
  if (!token) {
    return;
  }

  const imagesService = ImagesService.getInstance(token);

  try {
    const image = await imagesService.getById('non-existent-id');
    console.log('Image found:', image);
  } catch (error) {
    console.error('Error fetching image:');
    const err = error as {
      status?: number;
      message?: string;
      originalError?: unknown;
    };
    console.error('- Status:', err.status);
    console.error('- Message:', err.message);
    console.error('- Original error:', err.originalError);
  }
}
