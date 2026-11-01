import { cn } from "../../lib/utils";
import { priorityMeta } from "../../lib/utils";

export const PriorityBadge = ({ priority, className }) => {
  const meta = priorityMeta(priority);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold tracking-tight backdrop-blur-sm",
        className
      )}
      style={{
        color: meta.color,
        backgroundColor: `${meta.color}14`,
        borderColor: `${meta.color}30`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full shadow-sm" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
};

// Uppercase label-style pill (used as the card's top tag, like a category).
export const PriorityTag = ({ priority, className }) => {
  const meta = priorityMeta(priority);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]",
        className
      )}
      style={{
        color: meta.color,
        backgroundColor: `${meta.color}12`,
        borderColor: `${meta.color}25`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
};

export const Badge = ({ children, className }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium tracking-tight text-muted",
      className
    )}
  >
    {children}
  </span>
);
