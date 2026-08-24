import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export interface AdminSectionPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
}

/** Shared placeholder for admin sections that arrive in later phases. */
export function AdminSectionPlaceholder({
  icon,
  title,
  description,
  phase,
}: AdminSectionPlaceholderProps) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-navy-800 sm:text-3xl">
        {title}
      </h1>
      <div className="mt-6">
        <EmptyState
          icon={icon}
          title={`${title} arrives in ${phase}`}
          description={description}
        />
      </div>
    </div>
  );
}
