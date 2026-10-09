import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none ${className}`}
      {...props}
    />
  );
});
