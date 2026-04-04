/**
 * WebSocket event path generators
 */
export const WebSocketPaths = {
  activity: (activityId: string) => `/activities/${activityId}`,
  brand: (brandId: string) => `/brands/${brandId}`,
  image: (imageId: string) => `/images/${imageId}`,
  music: (musicId: string) => `/musics/${musicId}`,
  organization: (organizationId: string) => `/organizations/${organizationId}`,
  prompt: (promptId: string) => `/prompts/${promptId}`,
  publication: (publicationId: string) => `/posts/${publicationId}`,
  script: (scriptId: string) => `/scripts/${scriptId}`,
  user: (userId: string) => `/users/${userId}`,
  video: (videoId: string) => `/videos/${videoId}`,
};
