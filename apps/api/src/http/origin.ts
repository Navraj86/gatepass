import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { sendProblem } from "./problem.js";

const allowed = new URL(config.APP_URL).origin;
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cookies are SameSite=Lax, and on top of that every state-changing request
 * that carries an Origin header must come from the app's own origin.
 */
export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.header("origin");
  if (safeMethods.has(req.method) || !origin || origin === allowed) {
    next();
    return;
  }
  sendProblem(res, 403, "bad_origin", "Cross-origin request refused");
}
