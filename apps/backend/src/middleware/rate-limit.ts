import { Request, Response, NextFunction } from 'express';

/**
 * Simple in-memory rate limiter using token bucket algorithm.
 * Tracks requests per IP address.
 *
 * For production, consider using:
 * - redis-based rate limiting (cluster-aware)
 * - external services like Cloudflare, AWS WAF
 */
interface ClientBucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimitStore {
  private buckets: Map<string, ClientBucket> = new Map();
  private readonly capacity: number;
  private readonly refillIntervalMs: number;
  private readonly refillAmount: number;
  private cleanupInterval: NodeJS.Timeout;

  /**
   * @param capacity - Maximum tokens per bucket (e.g., 100 requests)
   * @param refillIntervalMs - Interval to add tokens (e.g., 60000ms = 1 minute)
   * @param refillAmount - Tokens to add per interval (e.g., 100 requests per minute)
   */
  constructor(capacity: number, refillIntervalMs: number, refillAmount: number) {
    this.capacity = capacity;
    this.refillIntervalMs = refillIntervalMs;
    this.refillAmount = refillAmount;

    // Clean up old buckets every 10 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000);
  }

  /**
   * Check if a client has exceeded the rate limit.
   * Returns true if the request is allowed, false if rate limited.
   */
  isAllowed(clientId: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(clientId);

    if (!bucket) {
      // First request from this client
      bucket = { tokens: this.capacity - 1, lastRefill: now };
      this.buckets.set(clientId, bucket);
      return true;
    }

    // Refill tokens based on elapsed time
    const elapsedMs = now - bucket.lastRefill;
    const refills = Math.floor(elapsedMs / this.refillIntervalMs);

    if (refills > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + refills * this.refillAmount);
      bucket.lastRefill = now;
    }

    // Check if request is allowed
    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Get the number of remaining tokens for a client (for diagnostics).
   */
  getRemainingTokens(clientId: string): number {
    const bucket = this.buckets.get(clientId);
    if (!bucket) {
      return this.capacity;
    }

    const now = Date.now();
    const elapsedMs = now - bucket.lastRefill;
    const refills = Math.floor(elapsedMs / this.refillIntervalMs);

    return Math.min(this.capacity, bucket.tokens + refills * this.refillAmount);
  }

  /**
   * Remove old buckets that haven't been used recently.
   * A bucket is considered stale if no requests in 30 minutes.
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThresholdMs = 30 * 60 * 1000;

    for (const [clientId, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > staleThresholdMs) {
        this.buckets.delete(clientId);
      }
    }
  }

  /**
   * Stop the cleanup interval. Call this during server shutdown.
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

/**
 * Express middleware factory for rate limiting by IP address.
 *
 * @param store - RateLimitStore instance
 * @param options - Configuration options
 * @returns Express middleware function
 *
 * Example usage:
 * ```
 * const limiter = new RateLimitStore(100, 60000, 100); // 100 req/min
 * router.use(createRateLimitMiddleware(limiter));
 * ```
 */
export function createRateLimitMiddleware(
  store: RateLimitStore,
  options?: { keyExtractor?: (req: Request) => string; statusCode?: number; message?: string },
) {
  const keyExtractor = options?.keyExtractor || ((req: Request) => getClientIp(req));
  const statusCode = options?.statusCode || 429;
  const message = options?.message || 'Too many requests, please try again later';

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = keyExtractor(req);
    const allowed = store.isAllowed(clientId);

    // Set rate limit headers for all responses
    const remainingTokens = store.getRemainingTokens(clientId);
    res.setHeader('X-RateLimit-Limit', '100'); // capacity
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remainingTokens)));

    if (!allowed) {
      return res.status(statusCode).json({
        error: 'rate_limit_exceeded',
        message,
      });
    }

    next();
  };
}

/**
 * Extract the client's IP address from the request.
 * Considers X-Forwarded-For header for proxied requests.
 */
function getClientIp(req: Request): string {
  const forwarded = req.header('X-Forwarded-For');
  if (forwarded) {
    // X-Forwarded-For can be a comma-separated list; take the first IP
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}
