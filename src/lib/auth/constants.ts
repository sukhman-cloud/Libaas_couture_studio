/** Cookie carrying the signed admin session. */
export const ADMIN_SESSION_COOKIE = "lcs_admin_session";

/** Admin session lifetime in seconds (8 hours). */
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8;

/** Cookie carrying the signed customer session. */
export const CUSTOMER_SESSION_COOKIE = "lcs_customer_session";

/** Customer session lifetime in seconds (30 days). */
export const CUSTOMER_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
