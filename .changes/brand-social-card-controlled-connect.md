packages: @genfeedai/pages @genfeedai/props

`BrandDetailSocialMediaCard` now takes optional controlled connect-modal
state: `isConnectAccountModalOpen` and `onConnectAccountModalOpenChange`
on `BrandDetailSocialMediaCardProps`. A page header can open the modal.
When those props are omitted, the card still owns the modal itself.
