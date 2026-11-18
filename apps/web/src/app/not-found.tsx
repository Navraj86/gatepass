import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-muted">This page does not exist or is not public yet.</p>
      <ButtonLink href="/" className="mt-6" variant="secondary">
        Back to events
      </ButtonLink>
    </div>
  );
}
