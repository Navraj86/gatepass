import { scanSchema } from "@gatepass/shared";
import { Router } from "express";
import { currentUser, requireEventStaff, requireRole } from "../auth/middleware.js";
import { pool } from "../db/client.js";
import { parse } from "../http/problem.js";
import { byUser, rateLimit } from "../http/rate-limit.js";
import { scanTicket } from "../tickets/scan.js";

export const staffRouter = Router();
staffRouter.use("/staff", requireRole("staff", "organizer"));

/** Staff see the events they are assigned to; organizers see their own. */
staffRouter.get("/staff/events", async (_req, res) => {
  const { rows } = await pool.query(
    `select e.id, e.title, e.venue, e.starts_at as "startsAt", e.status,
            (select count(*)::int from tickets t
               where t.event_id = e.id and t.status = 'valid') as "validTickets",
            (select count(*)::int from tickets t
               where t.event_id = e.id and t.status = 'valid' and t.scanned_at is not null) as "checkedIn"
     from events e
     where e.status = 'published'
       and (e.organizer_id = $1
            or exists (select 1 from event_staff s where s.event_id = e.id and s.user_id = $1))
     order by e.starts_at`,
    [currentUser(res).id],
  );
  res.json({ events: rows });
});

staffRouter.post("/staff/scan", requireEventStaff, rateLimit("scan", 60, 60, byUser), async (req, res) => {
  const { eventId, code } = parse(scanSchema, req.body, "scan");
  const result = await scanTicket({ eventId, rawCode: code, staffId: currentUser(res).id });
  res.json(result);
});
