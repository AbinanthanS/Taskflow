import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar } from "lucide-react";
import Avatar from "../ui/Avatar";
import { PriorityTag } from "../ui/Badge";
import { cn, formatDueDate } from "../../lib/utils";

const TaskCard = ({ task, onClick, overlay = false }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });

  const style = { transform: CSS.Translate.toString(transform), transition };
  const due = formatDueDate(task.due_date);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onClick?.(task)}
      className={cn(
        "group relative cursor-grab rounded-xl border border-line bg-surface p-4 active:cursor-grabbing",
        "shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-150 ease-[var(--ease-spring)]",
        "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[var(--shadow-soft)]",
        isDragging && "opacity-30",
        overlay && "rotate-2 cursor-grabbing shadow-[var(--shadow-lift)] ring-2 ring-brand-500/20"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <PriorityTag priority={task.priority} />
        {due && (
          <span
            className={cn(
              "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular",
              due.overdue
                ? "bg-rose-50 text-rose-600 border border-rose-200/60"
                : "bg-slate-100 text-slate-600 border border-slate-200/60"
            )}
          >
            <Calendar className="h-2.5 w-2.5" /> {due.label}
          </span>
        )}
      </div>

      <p className="mt-2.5 text-sm font-semibold leading-snug tracking-tight text-ink group-hover:text-brand-700 transition-colors">
        {task.title}
      </p>

      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
          {task.description}
        </p>
      )}

      <div className="mt-3.5 flex items-center justify-between border-t border-line/60 pt-2.5">
        {task.assignee_id ? (
          <div className="flex items-center gap-1.5">
            <Avatar name={task.assignee_name} id={task.assignee_id} src={task.assignee_avatar} size="xs" />
            <span className="max-w-[7.5rem] truncate text-[11px] font-medium text-muted">{task.assignee_name}</span>
          </div>
        ) : (
          <span className="text-[11px] font-medium text-faint">Unassigned</span>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
