"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Label as RadixLabel } from "radix-ui";
import { CircleAlert } from "lucide-react";

type FieldCtx = { id: string; describedBy?: string; invalid: boolean; required: boolean; disabled: boolean };
const Ctx = React.createContext<FieldCtx | null>(null);
export const useField = () => React.useContext(Ctx);

export function Label({ className, ...props }: React.ComponentProps<typeof RadixLabel.Root>) {
  return <RadixLabel.Root className={cn("text-label select-none", className)} {...props} />;
}

/**
 * Label + control + hint + error with correct ARIA wiring. Any Input / Textarea /
 * SelectTrigger rendered inside picks up id, aria-describedby and aria-invalid.
 */
export function Field({
  label, hint, error, required = false, disabled = false, className, children, optionalLabel, id: idProp,
}: {
  /** Use when something else (a focus target, a skip link) needs to know the control's id. Never set the id on the control itself. */
  id?: string;
  label: React.ReactNode; hint?: React.ReactNode; error?: string | null; required?: boolean; disabled?: boolean;
  className?: string; children: React.ReactNode; optionalLabel?: boolean;
}) {
  const autoId = React.useId();
  const id = idProp ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <Ctx.Provider value={{ id, describedBy, invalid: !!error, required, disabled }}>
      <div className={cn("grid content-start gap-1.5", className)}>
        <Label htmlFor={id}>
          {label}
          {required ? <span aria-hidden className="ml-0.5 text-danger">*</span> : null}
          {optionalLabel && !required ? <span className="ml-1.5 font-normal text-quiet">Optional</span> : null}
        </Label>
        {children}
        {hint ? <p id={hintId} className="text-caption text-quiet">{hint}</p> : null}
        {error ? (
          <p id={errorId} role="alert" className="flex items-start gap-1.5 text-caption font-medium text-danger">
            <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}

type FieldLike = { id?: string; "aria-describedby"?: string; "aria-invalid"?: React.AriaAttributes["aria-invalid"]; required?: boolean; disabled?: boolean };

export function useFieldProps<T extends FieldLike>(props: T): T {
  const f = useField();
  if (!f) return props;
  return {
    ...props,
    id: props.id ?? f.id,
    "aria-describedby": props["aria-describedby"] ?? f.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (f.invalid || undefined),
    required: props.required ?? (f.required || undefined),
    disabled: props.disabled ?? (f.disabled || undefined),
  };
}
