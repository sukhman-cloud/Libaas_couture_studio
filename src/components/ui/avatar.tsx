import Image from "next/image";
import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
} as const;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export interface AvatarProps {
  name: string;
  src?: string;
  size?: keyof typeof sizes;
  className?: string;
}

/** Avatar with automatic initials fallback when no image is provided. */
export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const dimension = size === "sm" ? 32 : size === "md" ? 40 : 56;
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-100 font-medium text-navy-700 ring-1 ring-cream-200",
        sizes[size],
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          width={dimension}
          height={dimension}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
      {!src && <span className="sr-only">{name}</span>}
    </span>
  );
}
