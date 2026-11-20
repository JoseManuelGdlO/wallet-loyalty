import * as React from "react";
import { cn } from "@/lib/utils";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-ink/70">{label}</span>
      {children}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn("h-11 rounded-2xl border border-ink/10 bg-white px-3 outline-none", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("min-h-24 rounded-2xl border border-ink/10 bg-white px-3 py-2 outline-none", props.className)} />;
}
