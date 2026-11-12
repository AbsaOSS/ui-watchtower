import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * An async route handler, as Express takes one. Built with zone.js, an async
 * function returns zone's own promise, which Express warns about; this
 * returns nothing and passes a failure to `next`.
 */
export function promised(
  handler: (req: Request, res: Response) => Promise<void>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
