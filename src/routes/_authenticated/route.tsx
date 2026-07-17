import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const isAdmin = localStorage.getItem("admin_session") === "true";
      const isUser = localStorage.getItem("user_session") === "true";
      if (!isAdmin && !isUser) throw redirect({ to: "/user-auth" });
    }
    return { user: { id: "session", email: "user" } };
  },
  component: () => <Outlet />,
});
