/**
 * Rate limiting for endpoints that are either public (no auth required)
 * or expensive — because they call out to third-party services
 * (OpenLibrary) or do significant work (file parsing, batched DB writes).
 *
 * Uses express-rate-limit's default in-memory store. That's fine for a
 * single-instance deployment (which is what this project runs as); if
 * this is ever split across multiple server instances, swap the `store`
 * option for `rate-limit-redis` so counts are shared across processes —
 * an in-memory store on its own would let each instance apply the limit
 * independently, effectively multiplying the allowed rate.
 */
import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { logger } from "./logger.js";

/**
 * Rate-limit key: prefer the authenticated user's id (set by the
 * `requireAuth` middleware as `req.userId`) so one user can't exhaust
 * another's quota by sharing a network/IP, and so a single user is
 * limited consistently across devices. Falls back to IP for routes that
 * don't require auth (e.g. the public ISBN lookup endpoints).
 */
function keyByUserOrIp(req: Request): string {
  const userId = (req as unknown as { userId?: string }).userId;
  return userId ? `user:${userId}` : `ip:${req.ip}`;
}

function makeLimiter(options: { windowMs: number; max: number; message: string }) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyByUserOrIp,
    handler: (req, res) => {
      logger.warn(
        { key: keyByUserOrIp(req), path: req.originalUrl },
        "Rate limit exceeded",
      );
      res.status(429).json({ error: options.message });
    },
  });
}

/**
 * Single ISBN lookup (`GET /isbn-lookup`) — hit once per barcode scan
 * during normal use, and unauthenticated, so this is the most exposed
 * endpoint to abuse. One external call per request.
 */
export const isbnLookupLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many ISBN lookups — please wait a moment and try again.",
});

/**
 * Bulk ISBN lookup (`POST /isbn-bulk-lookup`) — each request can trigger
 * up to 20 external calls (see the route's own cap), so the per-request
 * limit here is much stricter than the single-lookup one.
 */
export const isbnBulkLookupLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 6,
  message: "Too many bulk lookups — please wait a moment and try again.",
});

/**
 * File import (`/import/parse`, `/import/confirm`) — parsing + batched DB
 * writes, and confirm can trigger many downstream enrichment calls.
 */
export const importLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many import requests — please wait a few minutes and try again.",
});

/**
 * Bulk re-enrichment (`POST /enrich-all`) — can trigger one external call
 * per book missing metadata, so this is capped hard to stop a user from
 * repeatedly re-triggering a full-library re-fetch.
 */
export const enrichAllLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "You've hit the enrichment limit for now — please try again later.",
});
