import type { ReactNode } from "react";
import { Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Slot above the title (e.g. <Breadcrumb>). */
  breadcrumb?: ReactNode;
  /** Right-aligned actions (buttons/links). */
  actions?: ReactNode;
  className?: string;
}

/** Consistent page heading block for customer and admin screens. */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6 sm:mb-8", className)}>
      {breadcrumb && <div className="mb-3">{breadcrumb}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading level={1} className="text-2xl sm:text-3xl">
            {title}
          </Heading>
          {description && (
            <Text tone="muted" size="sm" className="mt-1 max-w-prose">
              {description}
            </Text>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
