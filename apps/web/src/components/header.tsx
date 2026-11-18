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
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-accent text-accent-ink">
            <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V5Z" />
            </svg>
          </span>
          Gatepass
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
          {links
            .filter((l) => l.show)
            .map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cx(
                    "whitespace-nowrap rounded-md px-2.5 py-1.5",
                    active ? "bg-surface font-medium" : "text-muted hover:text-ink",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
        </nav>
        {loading ? null : user ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{user.name}</span>
            <button
              type="button"
              className="text-muted hover:text-ink"
              onClick={async () => {
                await signOut();
                router.push("/");
                router.refresh();
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="text-sm font-medium">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
