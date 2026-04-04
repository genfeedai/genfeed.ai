import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export const PROJECT_STATUSES = ['active', 'completed', 'archived'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectDocument = Project & Document;

@Schema({
  collection: 'projects',
  timestamps: true,
  versionKey: false,
})
export class Project {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ required: true, trim: true, type: String })
  label!: string;

  @Prop({ required: false, type: String })
  description?: string;

  @Prop({
    default: 'active',
    enum: PROJECT_STATUSES,
    type: String,
  })
  status!: ProjectStatus;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
