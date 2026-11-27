import { ChevronLeft } from "lucide-react";
import { NavLink } from "@/features/settings/components/shared";
import { cn } from "@/lib/utils";

export type BackButtonProps = (
  | { href: string; onClick?: never; disabled?: never }
  | { onClick: () => void; href?: never; disabled?: boolean }
) & {
  label: string;
  className?: string;
};

const backButtonClassName =
  "inline-flex h-10 w-10 min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border-0 bg-transparent text-foreground no-underline transition-colors hover:bg-foreground/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-35";

export function BackButton(props: BackButtonProps) {
  const classes = cn(backButtonClassName, props.className);
  const icon = <ChevronLeft size={22} aria-hidden="true" />;

  if ("href" in props && props.href !== undefined) {
    return (
      <NavLink
        href={props.href}
        aria-label={props.label}
        data-slot="back-button"
        className={classes}
      >
        {icon}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      data-slot="back-button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={classes}
    >
      {icon}
    </button>
  );
}
