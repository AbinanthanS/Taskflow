import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

const Modal = ({ open, onClose, title, description, children, footer, size = "md" }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-3xl" };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md transition-opacity" onClick={onClose} />
          <motion.div
            className={cn(
              "card relative z-10 mt-12 w-full rounded-2xl border border-line bg-surface/95 p-6 shadow-[var(--shadow-lift)] backdrop-blur-xl",
              widths[size]
            )}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {(title || onClose) && (
              <div className="mb-5 flex items-start justify-between gap-4 border-b border-line pb-4">
                <div>
                  {title && <h2 className="font-display text-lg font-bold tracking-tight text-ink">{title}</h2>}
                  {description && <p className="mt-1 text-xs text-muted">{description}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {children}
            {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default Modal;
