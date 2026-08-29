import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { EmptyState, SkeletonRows } from "./primitives";
import { cn } from "@/utils/cn";

export interface Column<T> {
  key: string;
  header: string;
  align?: "start" | "end";
  width?: string;
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T extends { id: string }> {
  label: string;
  rows: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  onOpenRow?: (row: T) => void;
  /** Visual emphasis for the newest row (used after a create action). */
  highlightId?: string | null;
}

/**
 * One table for agents, sessions and campaigns.
 * Horizontally scrollable inside its own container so narrow screens never widen the page,
 * with real <th scope="col"> + aria-sort so screen readers get the ordering state.
 */
export function DataTable<T extends { id: string }>({
  label,
  rows,
  columns,
  loading = false,
  emptyTitle = "Nothing here yet",
  emptyBody = "Create an entry to populate this view.",
  emptyAction,
  onOpenRow,
  highlightId,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-hair bg-white p-4">
        <SkeletonRows rows={5} />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-hair bg-white studio-scroll">
      <table className="w-full min-w-[760px] border-collapse text-start" aria-label={label}>
        <thead>
          <tr className="border-b border-hair bg-mist/60">
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const ariaSort = !column.sortValue
                ? undefined
                : active
                  ? sort?.dir === "asc"
                    ? ("ascending" as const)
                    : ("descending" as const)
                  : ("none" as const);
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn(
                    "px-4 py-3 font-display text-[10px] font-bold tracking-[0.16em] text-black/45 uppercase",
                    column.align === "end" ? "text-end" : "text-start",
                    column.width
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="inline-flex cursor-pointer items-center gap-1.5 uppercase transition-colors hover:text-black"
                    >
                      {column.header}
                      {active ? (
                        sort?.dir === "asc" ? (
                          <ArrowUp size={11} />
                        ) : (
                          <ArrowDown size={11} />
                        )
                      ) : (
                        <span aria-hidden="true" className="text-black/20">
                          ↕
                        </span>
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {onOpenRow ? <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">Row actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "border-b border-hair/70 transition-colors duration-300 last:border-b-0 hover:bg-mist/70",
                highlightId === row.id && "bg-mist"
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3.5 align-middle text-[13.5px] text-black/70",
                    column.align === "end" && "text-end"
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
              {onOpenRow ? (
                <td className="px-4 py-3.5 text-end">
                  <button
                    type="button"
                    onClick={() => onOpenRow(row)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-hair px-2.5 py-1 font-display text-[10px] font-bold tracking-[0.12em] uppercase transition-colors hover:border-black/30 hover:bg-white"
                  >
                    View
                    <ChevronRight size={12} />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
