import { IsNotEmpty, IsString } from 'class-validator';

export class EnsureReleaseFromPostDto {
  @IsString()
  @IsNotEmpty()
  postId!: string;
}
