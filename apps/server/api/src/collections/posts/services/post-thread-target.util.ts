import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { parsePlatform, TargetExecutionState } from '@genfeedai/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';

export async function resolveThreadReplyTarget({
  dto,
  parentPost,
  identity,
  credentialsService,
  requestedExecutionState,
}: {
  dto: CreatePostDto;
  parentPost: PostDocument;
  identity: AuthenticatedUser;
  credentialsService: CredentialsService;
  requestedExecutionState: TargetExecutionState;
}) {
  if (dto.credentialId && dto.credentialId !== parentPost.credentialId) {
    throw new HttpException(
      'Thread replies must use the parent account',
      HttpStatus.BAD_REQUEST,
    );
  }
  const replyCredentialId = parentPost.credentialId ?? undefined;
  const credential = replyCredentialId
    ? await credentialsService.findOne({
        id: replyCredentialId,
        ...(requestedExecutionState !== TargetExecutionState.DRAFT
          ? { isConnected: true }
          : {}),
        isDeleted: false,
        organizationId: identity.organizationId,
      })
    : null;

  if (replyCredentialId && !credential) {
    throw new HttpException(
      {
        detail: 'Credential not found',
        title: `Credential ${replyCredentialId.toString()} not found`,
      },
      HttpStatus.NOT_FOUND,
    );
  }

  if (!credential && requestedExecutionState !== TargetExecutionState.DRAFT) {
    throw new HttpException(
      'Connect an account before scheduling or publishing',
      HttpStatus.BAD_REQUEST,
    );
  }
  const credentialPlatform = parsePlatform(
    credential?.platform ?? parentPost.platform,
  );
  if (!credentialPlatform) {
    throw new HttpException(
      {
        detail: 'Unsupported credential platform',
        title: 'Platform not supported',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  const parentPlatform =
    parsePlatform(parentPost.platform) ?? credentialPlatform;
  if (
    (dto.platform && dto.platform !== parentPlatform) ||
    credentialPlatform !== parentPlatform
  ) {
    throw new HttpException(
      'Thread replies must use the parent channel',
      HttpStatus.BAD_REQUEST,
    );
  }
  return { credential, credentialPlatform, replyCredentialId };
}
