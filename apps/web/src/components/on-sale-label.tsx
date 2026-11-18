"use client";

import { useEffect, useState } from "react";
import { formatCountdown, formatWait } from "@/lib/format";

/** "On sale now", or a countdown that ticks down to the on-sale time. */
export function OnSaleLabel({ saleStartsAt, onOpen }: { saleStartsAt: string; onOpen?: () => void }) {
  const opensAt = Date.parse(saleStartsAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (opensAt <= Date.now()) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= opensAt) {
        clearInterval(timer);
        onOpen?.();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [opensAt, onOpen]);

  if (now === null) return <span className="inline-block h-6" />;
  const left = opensAt - now;
  if (left <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/15 px-2.5 py-1 text-xs font-medium text-ok">
        <span className="size-1.5 rounded-full bg-ok" /> On sale now
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-warn/15 px-2.5 py-1 text-xs font-medium tabular-nums text-warn">
      On sale in {left < 60 * 60 * 1000 ? formatCountdown(left) : formatWait(left)}
    </span>
  );
}
