"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="bar-top grid justify-items-start gap-5 pt-8">
      <h1 className="text-display-s">Something went wrong</h1>
      <p className="lead text-ink-2">The page could not load. Try again in a moment.</p>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
