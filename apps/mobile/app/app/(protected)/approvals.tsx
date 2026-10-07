import { ErrorScreen } from '@/components/ScreenStates';

/**
 * The API exposes POST /publish-approvals only. Listing would 404, and an
 * empty queue would look like there is nothing to review.
 */
export default function Approvals() {
  return (
    <ErrorScreen
      message="Publish review is unavailable"
      subMessage="This app cannot load a review queue. Nothing here was treated as an empty list."
    />
  );
}
