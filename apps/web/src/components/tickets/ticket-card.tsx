"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Badge, cx } from "@/components/ui";
import { formatDateTime, formatTicketCode } from "@/lib/format";
import type { Ticket } from "@/lib/types";

/** The QR code holds only the ticket code; the scanner checks it with the API. */
export function TicketCard({ ticket, eventTitle }: { ticket: Ticket; eventTitle?: string }) {
  const [qr, setQr] = useState<string>();
  const usable = ticket.status === "valid" && !ticket.scannedAt;

  useEffect(() => {
    QRCode.toDataURL(ticket.code, { width: 360, margin: 1, errorCorrectionLevel: "M" }).then(setQr);
  }, [ticket.code]);

  return (
    <div className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
      <div className={cx("size-32 shrink-0 rounded-lg bg-white p-1.5", !usable && "opacity-30")}>
        {/* biome-ignore lint/performance/noImgElement: a data URL needs no image optimisation */}
        {qr ? <img src={qr} alt={`QR code for ${ticket.code}`} className="size-full" /> : null}
      </div>
      <div className="min-w-0 text-sm">
        {eventTitle ? <p className="font-semibold">{eventTitle}</p> : null}
        <p className="font-medium">
          {ticket.sectionName}, row {ticket.rowLabel}, seat {ticket.seatNumber}
        </p>
        <p className="mt-1 break-all font-mono text-xs text-muted">{formatTicketCode(ticket.code)}</p>
        <div className="mt-2">
          {ticket.status === "refunded" ? (
            <Badge status="refunded" />
          ) : ticket.scannedAt ? (
            <span className="text-xs text-muted">Checked in {formatDateTime(ticket.scannedAt)}</span>
          ) : (
            <Badge status="valid" />
          )}
        </div>
      </div>
    </div>
  );
}
