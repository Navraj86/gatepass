"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import type { Role, User } from "@/lib/types";
import { useAuth } from "./auth";
import { Spinner } from "./ui";

/** Client-side gate for signed-in pages. The API enforces the same rules on every request. */
export function RequireUser({ roles, children }: { roles?: Role[]; children: (user: User) => ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <Spinner />;
  if (roles && !roles.includes(user.role)) {
    return <p className="py-10 text-muted">This page is for {roles.join(" and ")} accounts.</p>;
  }
  return <>{children(user)}</>;
}
