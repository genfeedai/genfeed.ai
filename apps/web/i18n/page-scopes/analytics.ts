import analytics from '../../messages/en/pages/analytics.json';
import brandSocialMedia from '../../messages/en/pages/brandSocialMedia.json';
import posts from '../../messages/en/pages/posts.json';
import publishing from '../../messages/en/pages/publishing.json';
import remixBrief from '../../messages/en/pages/remixBrief.json';
import socialIntelligence from '../../messages/en/pages/socialIntelligence.json';

const messages = {
  brandSocialMedia: { profilePictureAlt: brandSocialMedia.profilePictureAlt },
  posts: { detail: posts.detail, list: posts.list },
  // Newsletter results share their copy with the Publishing newsletter pages.
  publishing: { newsletter: publishing.newsletter },
  remixBrief,
  analytics,
  socialIntelligence,
};

export default messages;
