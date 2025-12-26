import React, { useState } from "react";
import Section from "../components/Section";

const initialRows = Array.from({ length: 8 }).map((_, index) => ({
  id: index + 1,
  name: `Row ${index + 1}`,
  status: index % 2 === 0 ? "Active" : "Paused"
}));

export default function Tables() {
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<number[]>([]);

  const toggleSelection = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-6">
      <Section title="Editable Data Grid">
        <table className="w-full text-sm" data-testid="data-grid">
          <thead className="text-left">
            <tr>
              <th className="py-2">Select</th>
              <th className="py-2">Name</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-black/10">
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() => toggleSelection(row.id)}
                    data-testid={`row-select-${row.id}`}
                  />
                </td>
                <td className="py-2">
                  <input
                    className="w-full rounded border border-black/20 p-1"
                    defaultValue={row.name}
                    onBlur={(event) =>
                      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, name: event.target.value } : item)))
                    }
                    data-testid={`row-name-${row.id}`}
                  />
                </td>
                <td className="py-2">
                  <select
                    className="rounded border border-black/20 p-1"
                    defaultValue={row.status}
                    onChange={(event) =>
                      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: event.target.value } : item)))
                    }
                    data-testid={`row-status-${row.id}`}
                  >
                    <option>Active</option>
                    <option>Paused</option>
                    <option>Archived</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-xs">Selected: {selected.length}</div>
      </Section>

      <Section title="Pagination Variants">
        <div className="flex items-center gap-4 text-sm">
          <button className="rounded border border-black/20 px-3 py-1" data-testid="cursor-prev">
            Cursor Prev
          </button>
          <button className="rounded border border-black/20 px-3 py-1" data-testid="cursor-next">
            Cursor Next
          </button>
          <button className="rounded border border-black/20 px-3 py-1" data-testid="offset-next">
            Offset Next
          </button>
        </div>
      </Section>

      <Section title="Bulk Actions">
        <div className="flex gap-3">
          <button className="rounded bg-ember px-3 py-2 text-white" data-testid="bulk-export">
            Export CSV
          </button>
          <button className="rounded bg-tide px-3 py-2 text-white" data-testid="bulk-archive">
            Archive Selected
          </button>
        </div>
      </Section>

      <Section title="Column Controls">
        <div className="flex flex-wrap gap-3 text-sm">
          <button className="rounded border border-black/20 px-3 py-1" data-testid="col-resize">
            Resize Column
          </button>
          <button className="rounded border border-black/20 px-3 py-1" data-testid="col-reorder">
            Reorder Columns
          </button>
          <button className="rounded border border-black/20 px-3 py-1" data-testid="col-pin">
            Pin Column
          </button>
        </div>
      </Section>

      <Section title="Server-side Sorting & Filtering">
        <div className="flex flex-wrap gap-3 text-sm">
          <button className="rounded border border-black/20 px-3 py-1" data-testid="sort-asc">
            Sort Asc
          </button>
          <button className="rounded border border-black/20 px-3 py-1" data-testid="sort-desc">
            Sort Desc
          </button>
          <button className="rounded border border-black/20 px-3 py-1" data-testid="filter-active">
            Filter Active
          </button>
        </div>
      </Section>
    </div>
  );
}
