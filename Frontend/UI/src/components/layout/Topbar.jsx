import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Plus, Search, Command, Bell } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLayout } from "./AppLayout";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";

const Topbar = ({ title, subtitle, actions, onCreateBoard }) => {
  const { user, logout } = useAuth();
  const { openCommand } = useLayout() || {};
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-line/80 px-6 backdrop-blur-xl">
      <div className="min-w-0 shrink">
        {title && <h1 className="truncate font-display text-lg font-bold leading-tight tracking-tight text-ink">{title}</h1>}
        {subtitle && <p className="truncate text-xs font-medium text-muted">{subtitle}</p>}
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        {/* Search → command menu */}
        <button
          onClick={openCommand}
          className="hidden h-9 w-60 items-center gap-2.5 rounded-xl border border-line bg-surface/80 px-3.5 text-xs text-muted shadow-xs transition-all duration-150 hover:border-slate-300 hover:bg-surface hover:text-ink md:flex lg:w-72"
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
          <span className="flex-1 text-left">Search tasks, boards…</span>
          <kbd className="flex items-center gap-0.5 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted shadow-2xs">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {actions}

        <button
          className="hidden h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-xs transition-all duration-150 hover:border-slate-300 hover:text-ink hover:shadow-sm sm:flex"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        <Button size="sm" onClick={onCreateBoard} className="hidden sm:inline-flex shadow-sm">
          <Plus className="h-3.5 w-3.5" /> New board
        </Button>

        <div className="relative" ref={ref}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface p-1 pr-2.5 shadow-xs transition-all duration-150 hover:border-slate-300 hover:shadow-sm"
          >
            <Avatar name={user?.name} id={user?.id} src={user?.avatar_url} size="sm" />
            <span className="hidden max-w-[7rem] truncate text-xs font-semibold text-ink lg:block">
              {user?.name?.split(" ")[0]}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-faint" />
          </button>

          {menuOpen && (
            <div className="card animate-in absolute right-0 mt-2 w-56 rounded-2xl p-1.5 shadow-[var(--shadow-lift)]">
              <div className="px-3 py-2">
                <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
                <p className="truncate text-xs text-faint">{user?.email}</p>
              </div>
              <div className="my-1 border-t" />
              <button
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-priority-urgent transition-colors hover:bg-surface-2"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
