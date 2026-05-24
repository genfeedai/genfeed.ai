import { Command } from 'commander';
import { articleCommand } from './article';
import { articleXCommand } from './article-x';
import { imageCommand } from './image';
import { videoCommand } from './video';

export const generateCommand = new Command('generate')
  .description('Generate AI content')
  .addCommand(articleCommand)
  .addCommand(articleXCommand)
  .addCommand(imageCommand)
  .addCommand(videoCommand);
