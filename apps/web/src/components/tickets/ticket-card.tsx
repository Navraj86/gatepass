"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { formatDateTime, formatTicketCode } from "@/lib/format";
import type { Ticket } from "@/lib/types";

/**
 * The ticket as a two-pass stub: the seat on the second pass, the QR code on paper in the first.
 * The QR code holds only the ticket code; the scanner checks it with the API.
 */
export function TicketCard({ ticket, eventTitle, when }: { ticket: Ticket; eventTitle?: string; when?: string }) {
  const [qr, setQr] = useState<string>();
  const usable = ticket.status === "valid" && !ticket.scannedAt;
  const refunded = ticket.status === "refunded";

  useEffect(() => {
    QRCode.toDataURL(ticket.code, { width: 360, margin: 1, errorCorrectionLevel: "M" }).then(setQr);
  }, [ticket.code]);

  return (
    <article className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className={cx("flex min-w-0 flex-col justify-between gap-6 p-5", usable ? "pass-2" : "bg-paper-3 text-ink")}>
        <div className="min-w-0">
          {eventTitle ? <h3 className="text-xl">{eventTitle}</h3> : null}
          {when ? <p className="label mt-1 text-md">{when}</p> : null}
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t-4 border-current pt-3">
          <div className="min-w-0">
            <dt className="label">Section</dt>
            <dd className="display text-lg">{ticket.sectionName}</dd>
          </div>
          <div>
            <dt className="label">Row</dt>
            <dd className="figure text-2xl">{ticket.rowLabel}</dd>
          </div>
          <div>
            <dt className="label">Seat</dt>
            <dd className="figure text-2xl">{ticket.seatNumber}</dd>
          </div>
        </dl>
      </div>
      <div
        className={cx(
          "grid justify-items-center gap-2 border-t-2 border-dashed border-ink p-5 sm:border-t-0 sm:border-l-2",
          usable ? "pass-1" : "bg-paper-2 text-ink",
        )}
      >
        <div className={cx("size-36 bg-paper p-1.5", !usable && "opacity-30")}>
          {qr ? (
            // biome-ignore lint/performance/noImgElement: a data URL needs no image optimisation
            <img src={qr} alt={`QR code for ${ticket.code}`} width={132} height={132} className="size-full" />
          ) : null}
        </div>
        <p className="label max-w-36 text-center tabular-nums break-all">{formatTicketCode(ticket.code)}</p>
        <p className="label">
          {refunded ? "Refunded" : ticket.scannedAt ? `Checked in ${formatDateTime(ticket.scannedAt)}` : "Admit one"}
        </p>
      </div>
    </article>
  );
}
