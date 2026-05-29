import { createFileRoute, useSearch } from "@tanstack/react-router";
import App from "@/App";

type AppSearch = {
  t?: string;
};

export const Route = createFileRoute("/")({
  validateSearch,
  component: DashboardRoute,
});

function validateSearch(search: Record<string, unknown>): AppSearch {
  return {
    t: typeof search.t === "string" ? search.t : undefined,
  };
}

function DashboardRoute() {
  const { t } = useSearch({ from: "/" });
  return <App token={t ?? ""} />;
}
