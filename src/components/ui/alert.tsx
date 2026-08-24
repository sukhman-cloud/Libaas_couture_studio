import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const toneConfig: Record<
  Tone,
  { icon: typeof Info; classes: string }
> = {
  info: { icon: Info, classes: "border-navy-200 bg-navy-50 text-navy-800" },
  success: {
    icon: CheckCircle2,
    classes: "border-success/30 bg-success/10 text-success",
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-warning/30 bg-warning/10 text-warning",
  },
  danger: {
    icon: XCircle,
    classes: "border-danger/30 bg-danger/10 text-danger",
  },
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  title?: string;
}

export function Alert({
  tone = "info",
  title,
  className,
  children,
  ...props
}: AlertProps) {
  const { icon: Icon, classes } = toneConfig[tone];
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        classes,
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}
