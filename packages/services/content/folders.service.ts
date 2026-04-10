import { API_ENDPOINTS } from '@genfeedai/constants';
import { Folder } from '@genfeedai/models/content/folder.model';
import { FolderSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class FoldersService extends BaseService<Folder> {
  constructor(token: string) {
    super(API_ENDPOINTS.FOLDERS, token, Folder, FolderSerializer);
  }

  public static getInstance(token: string): FoldersService {
    return BaseService.getDataServiceInstance(
      FoldersService,
      token,
    ) as FoldersService;
  }
}
