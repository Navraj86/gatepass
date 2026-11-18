"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Notice } from "@/components/ui";

/**
 * Rear camera QR reader. html5-qrcode touches `window` on import, so it is
 * loaded inside the effect. `paused` stops decoding while a result is shown.
 */
export function Camera({ onCode, paused }: { onCode: (code: string) => void; paused: boolean }) {
  const id = `camera-${useId().replaceAll(":", "")}`;
  const [error, setError] = useState<string>();
  const onCodeRef = useRef(onCode);
  const pausedRef = useRef(paused);
  onCodeRef.current = onCode;
  pausedRef.current = paused;

  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | undefined;
    let cancelled = false;

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      scanner = new Html5Qrcode(id, { verbose: false });
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
          (text) => {
            if (!pausedRef.current) onCodeRef.current(text);
          },
          undefined,
        );
        if (cancelled) await scanner.stop();
      } catch {
        if (!cancelled) setError("Camera unavailable. Allow camera access, or type the code below.");
      }
    })();

    return () => {
      cancelled = true;
      if (scanner?.isScanning) void scanner.stop().then(() => scanner?.clear());
    };
  }, [id]);

  return (
    <div className="grid gap-2">
      <div id={id} className="aspect-square w-full overflow-hidden rounded-2xl bg-black [&_video]:object-cover" />
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}
