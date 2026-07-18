import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';

interface CloudConnectionNoticeProps {
  onConnect: () => void;
}

export default function CloudConnectionNotice({
  onConnect,
}: CloudConnectionNoticeProps) {
  return (
    <div className="cloud-connection-notice">
      <div>
        <strong>Cloud action</strong>
        <span>Connect Genfeed Cloud to use managed runs and publishing.</span>
      </div>
      <Button
        className="small"
        onClick={onConnect}
        type="button"
        variant={ButtonVariant.SECONDARY}
      >
        Connect Genfeed Cloud
      </Button>
    </div>
  );
}
