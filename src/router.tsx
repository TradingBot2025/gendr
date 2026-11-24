import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep data "fresh" for 60s so navigating between pages doesn't refetch
        // everything from scratch each time (the app felt slow because every
        // query refetched on every mount/navigation/focus with the default
        // staleTime of 0). Mutations still call invalidateQueries(), which
        // refetches immediately regardless of staleTime, so data stays correct.
        staleTime: 60_000,
        // Keep unused cached data in memory for 5 minutes (avoids re-fetching
        // when briefly navigating away and back).
        gcTime: 5 * 60_000,
        // Don't refetch every time the tab regains focus — a major source of
        // perceived slowness and unnecessary network load.
        refetchOnWindowFocus: false,
        // Fail faster instead of retrying several times on a slow/broken network.
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    // Aligned with the query staleTime (60s): preloaded route data is reused on
    // navigation instead of forcing a refetch every time, which makes page
    // transitions feel instant. Mutations still invalidate and refetch.
    defaultPreloadStaleTime: 60_000,
  });

  return router;
};
