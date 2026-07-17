import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const isAdmin = localStorage.getItem("admin_session") === "true";
      if (!isAdmin) throw redirect({ to: "/auth" });
    }
    return { user: { id: "admin", email: "admin" } };
  },
  component: () => <Outlet />,
});
