import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";

export interface AdminSectionPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
  /** Optional pointer to where related functionality already exists. */
  action?: ReactNode;
}

/** Shared placeholder for admin sections that arrive in later phases. */
export function AdminSectionPlaceholder({
  icon,
  title,
  description,
  phase,
  action,
}: AdminSectionPlaceholderProps) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-navy-800 sm:text-3xl">
        {title}
      </h1>
      <div className="mt-6">
        <EmptyState
          icon={icon}
          title={`Arrives in ${phase}`}
          description={description}
          action={action}
        />
      </div>
    </div>
  );
}
