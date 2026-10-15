import SwaggerUI from '../components/SwaggerUI';
import rootMeta from './_meta';
import advancedMeta from './advanced/_meta';
import apiReferenceMeta from './api-reference/_meta';
import coreLoopMeta from './core-loop/_meta';
import guidesMeta from './guides/_meta';
import publishingMeta from './guides/publishing/_meta';
import socialMediaMeta from './guides/publishing/social-media/_meta';
import selfHostMeta from './self-host/_meta';

export const docsContentMetaRegistry = [
  rootMeta,
  advancedMeta,
  apiReferenceMeta,
  coreLoopMeta,
  guidesMeta,
  publishingMeta,
  socialMediaMeta,
  selfHostMeta,
];

export const docsMdxComponentRegistry = {
  SwaggerUI,
};
