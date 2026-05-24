import SwaggerUI from '../components/SwaggerUI';
import rootMeta from './_meta';
import advancedMeta from './advanced/_meta';
import apiReferenceMeta from './api-reference/_meta';
import cloudMeta from './cloud/_meta';
import coreMeta from './core/_meta';
import coreLoopMeta from './core-loop/_meta';
import deploymentMeta from './deployment/_meta';
import guidesMeta from './guides/_meta';
import publishingMeta from './guides/publishing/_meta';
import socialMediaMeta from './guides/publishing/social-media/_meta';

export const docsContentMetaRegistry = [
  rootMeta,
  advancedMeta,
  apiReferenceMeta,
  cloudMeta,
  coreMeta,
  coreLoopMeta,
  deploymentMeta,
  guidesMeta,
  publishingMeta,
  socialMediaMeta,
];

export const docsMdxComponentRegistry = {
  SwaggerUI,
};
