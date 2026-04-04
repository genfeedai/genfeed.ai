/**
 * WebSocket event path generators
 */
export const WebSocketPaths = {
  // Activity events
  activity: (activityId: string) => `/activities/${activityId}`,

  // Brand events
  brand: (brandId: string) => `/brands/${brandId}`,

  // Evaluation events
  evaluation: (evaluationId: string) => `/evaluations/${evaluationId}`,

  // Image events
  image: (imageId: string) => `/images/${imageId}`,

  // Music events
  music: (musicId: string) => `/musics/${musicId}`,

  // Organization events
  organization: (organizationId: string) => `/organizations/${organizationId}`,

  // Post events
  post: (postId: string) => `/posts/${postId}`,
  // Prompt events
  prompt: (promptId: string) => `/prompts/${promptId}`,

  // Script events
  script: (scriptId: string) => `/scripts/${scriptId}`,

  // User events
  user: (userId: string) => `/users/${userId}`,

  // Video events
  video: (videoId: string) => `/videos/${videoId}`,

  // Voice events
  voice: (voiceId: string) => `/voices/${voiceId}`,
};
