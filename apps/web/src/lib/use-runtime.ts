"use client";

import { createContext, use } from "react";

import type { AppRuntime } from "./runtime.ts";

export const RuntimeContext = createContext<AppRuntime | null>(null);

export function useRuntime(): AppRuntime {
  const runtime = use(RuntimeContext);
  if (!runtime) {
    throw new Error("useRuntime must be used inside <Providers>");
  }
  return runtime;
}
