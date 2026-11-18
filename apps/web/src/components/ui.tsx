import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "danger" | "ghost";

const buttonClass = (variant: Variant, small?: boolean, className?: string) =>
  cx("btn", `btn--${variant}`, small && "btn--small", className);

export function Button({
  variant = "primary",
  small,
  className,
  busy,
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; busy?: boolean; small?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClass(variant, small, className)}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <span aria-hidden className="spinner keep-motion" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  small,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; small?: boolean }) {
  return <Link className={buttonClass(variant, small, className)} {...props} />;
}

/** A well under the ink bar: the one container recipe for panels. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("bar-top bg-paper-2 p-5 sm:p-6", className)} {...props} />;
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="grid gap-1.5">
      <span className="label text-ink">{label}</span>
      {children}
      <span className={cx("min-h-[1lh] text-sm", error ? "font-semibold text-error" : "text-muted")}>
        {error ?? hint ?? ""}
      </span>
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx("input", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx("input", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx("input", className)} {...props} />;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const tones = {
    info: "border-ink text-ink",
    error: "border-error text-error font-semibold",
    ok: "border-success text-ink",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("border-l-4 bg-paper-2 px-4 py-3 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  paid: "pass-1",
  valid: "pass-1",
  published: "pass-1",
  pending: "pass-2",
  draft: "pass-2",
  refunding: "pass-2",
  refunded: "bg-paper-3 text-ink",
  cancelled: "bg-paper-3 text-ink",
  expired: "bg-paper-3 text-ink",
  failed: "bg-error text-paper",
};

export function Badge({ status }: { status: string }) {
  return (
    <span
      className={cx(
        "label inline-flex px-2 py-0.5 first-letter:uppercase",
        badgeTones[status] ?? "bg-paper-3 text-ink",
      )}
    >
      {status}
    </span>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-[60ch] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-muted" role="status">
      <span aria-hidden className="spinner keep-motion" />
      {label}
    </div>
  );
}

export { cx };
