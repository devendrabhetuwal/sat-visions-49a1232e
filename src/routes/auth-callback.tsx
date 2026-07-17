import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Satellite, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recordLoginEvent } from "./user-auth";

export const Route = createFileRoute("/auth-callback")({
  ssr: false,
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase automatically parses the URL hash/query after OAuth redirect.
    // Check for an existing session first, then listen for state change.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        localStorage.setItem("user_session", "true");
        recordLoginEvent("user", session.user.email ?? "google-user");
        navigate({ to: "/dashboard" });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        localStorage.setItem("user_session", "true");
        recordLoginEvent("user", session.user.email ?? "google-user");
        subscription.unsubscribe();
        navigate({ to: "/dashboard" });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center"
      style={{ background: "var(--background)" }}
    >
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: "var(--gradient-primary)" }}
      />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Satellite className="h-7 w-7 text-white" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Completing sign-in…
        </div>
      </div>
    </div>
  );
}
