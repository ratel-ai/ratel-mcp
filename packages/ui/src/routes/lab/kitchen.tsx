import { createFileRoute, useSearch } from "@tanstack/react-router";
import { KitchenSink } from "@/lab/KitchenSink";

type AppSearch = {
  t?: string;
};

export const Route = createFileRoute("/lab/kitchen")({
  validateSearch,
  component: KitchenRoute,
});

function validateSearch(search: Record<string, unknown>): AppSearch {
  return {
    t: typeof search.t === "string" ? search.t : undefined,
  };
}

function KitchenRoute() {
  const { t } = useSearch({ from: "/lab/kitchen" });
  return <KitchenSink token={t ?? ""} />;
}
