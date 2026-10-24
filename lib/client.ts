"use client";
import { useEffect, useState } from "react";
import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { StoreSnapshot } from "./contracts";
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Please try again."), {
      status: response.status,
    });
  return data as T;
}
export function useStore(id: string) {
  const [data, setData] = useState<StoreSnapshot | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let client: ConvexClient | undefined;
    let unsubscribe: (() => void) | undefined;
    const update = (next: StoreSnapshot) => {
      if (active)
        setData((old) =>
          !old || next.store.revision >= old.store.revision ? next : old,
        );
    };
    const refresh = () =>
      api<StoreSnapshot>(`/stores/${id}`)
        .then((d) => {
          update(d);
          if (active) setError("");
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    refresh();
    const interval = setInterval(refresh, 3000);
    api<{ convexUrl: string | null }>("/health")
      .then((h) => {
        if (h.convexUrl && active) {
          client = new ConvexClient(h.convexUrl);
          unsubscribe = client.onUpdate(
            makeFunctionReference<"query">("inventory:watch"),
            { storeId: id },
            (value) => {
              if (value) void refresh();
            },
          );
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      clearInterval(interval);
      unsubscribe?.();
      void client?.close();
    };
  }, [id]);
  return { data, error };
}
