import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="bar-top grid justify-items-start gap-5 pt-8">
      <h1 className="text-display-s">Not found</h1>
      <p className="lead text-ink-2">This page does not exist or is not public yet.</p>
      <ButtonLink href="/" variant="secondary">
        Back to events
      </ButtonLink>
    </div>
  );
}
