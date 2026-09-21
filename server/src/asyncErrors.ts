import type { Router, Request, Response, NextFunction } from "express";

// Express 4 does not await route handlers, so a rejected promise inside one
// becomes an unhandled rejection — which Node 22 treats as fatal. A single bad
// request therefore killed the whole server, and every subsequent request from
// the browser failed with a 502 until it was restarted by hand.
//
// This rewraps each handler so a rejection is forwarded to Express's error
// pipeline instead, turning "the app is down" into "that one request returned
// a 500". Reaching into router.stack is how express-async-errors does it too;
// the shape is stable across Express 4.x.
export function catchAsyncErrors<T extends Router>(router: T): T {
  for (const layer of (router as any).stack ?? []) {
    if (!layer.route) continue;
    for (const entry of layer.route.stack) {
      const original = entry.handle;
      // Arity 4 means it's already an error handler; leave it alone.
      if (typeof original !== "function" || original.length >= 4) continue;
      entry.handle = function (req: Request, res: Response, next: NextFunction) {
        try {
          return Promise.resolve(original.call(this, req, res, next)).catch(next);
        } catch (err) {
          return next(err);
        }
      };
    }
  }
  return router;
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  if (res.headersSent) return;
  // The message is kept server-side: it can carry query fragments and other
  // details that don't belong in a browser response.
  res.status(500).json({ error: "Something went wrong handling that request." });
}
