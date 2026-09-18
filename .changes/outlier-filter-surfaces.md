packages: @genfeedai/actions @genfeedai/pages @genfeedai/props @genfeedai/services

Add the Analytics Outliers page, ranked-list client service, and the read-only
`list_outlier_posts` agent action. Outlier row actions open Hooks by post id and
start a brand remix run into Studio.

No consumer migration is required. Existing analytics pages, remix callers, and
agent tools keep their current contracts. Refs #4402.
