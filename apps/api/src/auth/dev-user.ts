import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { sendProblem } from "../http/problem.js";

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const userId = config.DEV_AUTH ? req.header("x-user-id") : undefined;
  if (!userId) {
    sendProblem(res, 401, "unauthorized", "Sign in to continue");
    return;
  }
  res.locals.userId = userId;
  next();
}
