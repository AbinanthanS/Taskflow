import { cn } from "../../lib/utils";
import { Loader2 } from "lucide-react";

const variants = {
  primary:
    "brand-gradient text-white shadow-[var(--shadow-brand)] hover:brightness-[1.05] hover:shadow-[0_12px_28px_-4px_rgba(5,150,105,0.45)] border border-emerald-400/30",
  secondary:
    "bg-surface hover:bg-surface-2 text-ink border border-line shadow-[var(--shadow-card)] hover:border-slate-300 hover:shadow-[var(--shadow-soft)]",
  ghost: "hover:bg-surface-2 text-muted hover:text-ink transition-colors",
  danger:
    "bg-priority-urgent text-white shadow-[0_8px_20px_rgba(225,29,72,0.28)] hover:brightness-[1.06] border border-rose-400/30",
  outline: "border border-line bg-surface hover:border-brand-400 hover:bg-surface-2 text-ink shadow-[var(--shadow-card)]",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100/80 border border-brand-200/50",
};

const sizes = {
  sm: "h-8 px-3.5 text-xs gap-1.5 font-semibold",
  md: "h-10 px-4 text-sm gap-2 font-semibold",
  lg: "h-11 px-6 text-[15px] gap-2.5 font-semibold",
  icon: "h-10 w-10",
  iconSm: "h-8 w-8",
};

const Button = ({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  ...props
}) => (
  <button
    className={cn(
      "inline-flex select-none items-center justify-center whitespace-nowrap rounded-xl font-medium tracking-tight transition-all duration-200 ease-[var(--ease-spring)] focus-ring disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
      variants[variant],
      sizes[size],
      className
    )}
    disabled={disabled || loading}
    {...props}
  >
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
    {children}
  </button>
);

export default Button;
