import React from "react";

export default function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white/70 p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4" data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}
