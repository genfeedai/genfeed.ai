import articles from '../../messages/en/pages/articles.json';
import generationReceipts from '../../messages/en/pages/generationReceipts.json';
import library from '../../messages/en/pages/library.json';
import studioClips from '../../messages/en/pages/studioClips.json';
import studioEditor from '../../messages/en/pages/studioEditor.json';
import studioEditorLock from '../../messages/en/pages/studioEditorLock.json';
import studioMotion from '../../messages/en/pages/studioMotion.json';
import studioPlayground from '../../messages/en/pages/studioPlayground.json';
import studioStoryboard from '../../messages/en/pages/studioStoryboard.json';
import turboProjects from '../../messages/en/pages/turboProjects.json';

const messages = {
  articles: { edit: articles.edit },
  library: {
    knowledge: library.knowledge,
    recovery: library.recovery,
    review: library.review,
    tags: library.tags,
  },
  studioClips,
  studioStoryboard,
  studioEditorLock,
  studioPlayground,
  studioEditor,
  studioMotion,
  turboProjects,
  generationReceipts,
};

export default messages;
