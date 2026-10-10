"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

interface ToastProps {
  message: string | null;
  onDone: () => void;
}

export function Toast({ message, onDone }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDone, 2400);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-6 left-6 z-50">
      <AnimatePresence>
        {message ? (
          <motion.div
            key={message}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          >
            {message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
