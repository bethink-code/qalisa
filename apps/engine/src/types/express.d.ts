// Augment Express's Request with auth context set by middleware.
declare global {
  namespace Express {
    interface Request {
      /** Tenant resolved from a valid API key (set by apiKeyAuth). */
      tenantId?: string;
      /** Id of the API key used (set by apiKeyAuth). */
      apiKeyId?: string;
      /** Scopes granted by the API key (empty array = full access). */
      scopes?: string[];
      /** True when the request passed admin-token auth (set by adminAuth). */
      isAdmin?: boolean;
      /** Raw request body bytes — captured by express.json verify for webhook signature checks. */
      rawBody?: Buffer;
    }
  }
}

export {};
