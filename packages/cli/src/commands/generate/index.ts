import { Command } from 'commander';
import { articleCommand } from './article.js';
import { articleXCommand } from './article-x.js';
import { imageCommand } from './image.js';
import { videoCommand } from './video.js';

export const generateCommand = new Command('generate')
  .description('Generate AI content')
  .addCommand(articleCommand)
  .addCommand(articleXCommand)
  .addCommand(imageCommand)
  .addCommand(videoCommand);
