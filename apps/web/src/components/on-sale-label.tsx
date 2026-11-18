"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { formatCountdown, formatWait } from "@/lib/format";

/** "On sale now" printed in the first pass, or a countdown that ticks down to the on-sale time. */
export function OnSaleLabel({
  saleStartsAt,
  onOpen,
  className,
}: {
  saleStartsAt: string;
  onOpen?: () => void;
  className?: string;
}) {
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

  const base = cx("label inline-flex items-center px-3 py-1.5 tabular-nums", className);
  if (now === null) return <span className={cx(base, "invisible")}>On sale now</span>;
  const left = opensAt - now;
  if (left <= 0) return <span className={cx(base, "row-status pass-1")}>On sale now</span>;
  return (
    <span className={cx(base, "bg-ink text-on-ink")}>
      On sale in {left < 60 * 60 * 1000 ? formatCountdown(left) : formatWait(left)}
    </span>
  );
}
