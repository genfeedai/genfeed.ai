packages: @genfeedai/contracts, @genfeedai/props, @genfeedai/services, @genfeedai/serializers, @genfeedai/ui

Manual publishing, agent creation, batch rewriting, and inbox reply drafting no
longer seed agent chat. Add ModalEnum.NEWSLETTER, ModalNewsletterProps and
LazyModalNewsletter, SocialSuggestedReply and its serializer, the messages
suggestedReply client method, and the rewrite batch action. Review props expose
onBulkRewrite and rewritingIds in place of onBulkRewriteWithAgent.
