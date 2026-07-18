import type {
  DownloadNodeData,
  ImageGenNodeData,
  ImageInputNodeData,
  MotionControlNodeData,
  NodeType,
  VideoGenNodeData,
  VideoInputNodeData,
  WorkflowNodeData,
} from '@genfeedai/types';

export interface MediaInfo {
  url: string | null;
  urls?: string[];
  type: 'image' | 'video' | null;
}

/**
 * Extract media URL and type from node data
 */
export function getMediaFromNode(
  nodeType: NodeType,
  data: WorkflowNodeData,
): MediaInfo {
  switch (nodeType) {
    case 'imageGen': {
      const imgData = data as ImageGenNodeData;
      const urls = imgData.outputImages?.length ? imgData.outputImages : [];
      return {
        type: imgData.outputImage || urls.length ? 'image' : null,
        url: imgData.outputImage,
        urls,
      };
    }
    case 'videoGen': {
      const vidData = data as VideoGenNodeData;
      return {
        type: vidData.outputVideo ? 'video' : null,
        url: vidData.outputVideo,
      };
    }
    case 'imageInput': {
      const inputData = data as ImageInputNodeData;
      return { type: inputData.image ? 'image' : null, url: inputData.image };
    }
    case 'videoInput': {
      const vidInputData = data as VideoInputNodeData;
      return {
        type: vidInputData.video ? 'video' : null,
        url: vidInputData.video,
      };
    }
    case 'motionControl': {
      const mcData = data as MotionControlNodeData;
      return {
        type: mcData.outputVideo ? 'video' : null,
        url: mcData.outputVideo,
      };
    }
    case 'download': {
      const outData = data as DownloadNodeData;
      if (outData.inputVideo) {
        return { type: 'video', url: outData.inputVideo };
      }
      if (outData.inputImage) {
        return { type: 'image', url: outData.inputImage };
      }
      return { type: null, url: null };
    }
    default:
      return { type: null, url: null };
  }
}
