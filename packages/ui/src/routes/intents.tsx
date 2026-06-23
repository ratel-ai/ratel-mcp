import { createFileRoute } from "@tanstack/react-router";
import { IntentsPage } from "@/pages/IntentsPage";

type AppSearch = {
  t?: string;
};

export const Route = createFileRoute("/intents")({
  validateSearch,
  component: IntentsPage,
});

function validateSearch(search: Record<string, unknown>): AppSearch {
  return {
    t: typeof search.t === "string" ? search.t : undefined,
  };
}
