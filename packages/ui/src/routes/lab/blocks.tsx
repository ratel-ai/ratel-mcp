import { createFileRoute, useSearch } from "@tanstack/react-router";
import { BlockShowcase } from "@/lab/BlockShowcase";

type AppSearch = {
  t?: string;
};

export const Route = createFileRoute("/lab/blocks")({
  validateSearch,
  component: BlocksRoute,
});

function validateSearch(search: Record<string, unknown>): AppSearch {
  return {
    t: typeof search.t === "string" ? search.t : undefined,
  };
}

function BlocksRoute() {
  const { t } = useSearch({ from: "/lab/blocks" });
  return <BlockShowcase token={t ?? ""} />;
}
