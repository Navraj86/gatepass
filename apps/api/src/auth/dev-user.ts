import type { NextFunction, Request, Response } from "express";

export function requireUser(req: Request, res: Response, next: NextFunction) {
    if(process.env.DEV_AUTH !== "true") {
        res.status(401).json({ code: "unauthorized", message: "Sign-in is not available yet" });
        return;
    }

    const userId = req.header("x-user-id");
    if(!userId) {
        res.status(401).json({ code: "unauthorized", message: "Missing x-user-id header" });
        return;
    }

    res.locals.userId = userId;
    next();
};
