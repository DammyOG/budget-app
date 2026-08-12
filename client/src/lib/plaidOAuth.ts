export const PLAID_LINK_TOKEN_STORAGE_KEY = "plaid_link_token";

// OAuth banks redirect the whole page away and back, so anything needed to
// resume has to survive that round trip in sessionStorage, not component
// state. Reconnecting an existing item (update mode) completes differently
// from linking a new one — no public token to exchange, just a re-sync — so
// the returning page needs to know which flow it's in.
export const PLAID_LINK_MODE_STORAGE_KEY = "plaid_link_mode";
export const PLAID_RECONNECT_ITEM_ID_STORAGE_KEY = "plaid_reconnect_item_id";

export type PlaidLinkMode = "link" | "reconnect";
