"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth";
import { cx } from "./ui";

export function Header() {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/", label: "Events", show: true },
    { href: "/tickets", label: "My tickets", show: Boolean(user) },
    { href: "/organizer", label: "Organizer", show: user?.role === "organizer" },
    { href: "/staff", label: "Scan", show: user?.role === "staff" || user?.role === "organizer" },
  ];

  return (
    <header className="band-ink sticky top-0 z-(--z-sticky-nav) bg-ink text-on-ink">
      <div className="frame flex h-16 items-stretch gap-6">
        <Link href="/" aria-label="Gatepass, all events" className="wordmark flex items-center text-xl sm:text-2xl">
          Gatepass
        </Link>
        <nav aria-label="Main" className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
          {links
            .filter((l) => l.show)
            .map((l) => {
              const active =
                l.href === "/" ? pathname === "/" || pathname.startsWith("/events") : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "label flex items-center whitespace-nowrap border-b-4 px-3 pt-1 text-md",
                    active
                      ? "border-accent text-on-ink"
                      : "border-transparent text-on-ink-muted hover:border-on-ink-muted hover:text-on-ink",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
        </nav>
        <div className="flex shrink-0 items-center gap-4">
          {loading ? null : user ? (
            <>
              <span className="label hidden text-md text-on-ink-muted md:inline">{user.name}</span>
              <button
                type="button"
                className="label min-h-11 text-md text-on-ink underline decoration-accent decoration-2 underline-offset-4 hover:decoration-on-ink"
                onClick={async () => {
                  await signOut();
                  router.push("/");
                  router.refresh();
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(pathname)}`}
              className="label flex min-h-11 items-center text-md text-on-ink underline decoration-accent decoration-2 underline-offset-4 hover:decoration-on-ink"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
