"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { track } from "@/lib/track";

/** One page_view per path change. */
export function PageView() {
  const path = usePathname();
  useEffect(() => track("page_view"), [path]);
  return null;
}
