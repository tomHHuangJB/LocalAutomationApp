import React, { useState } from "react";
import Section from "../components/Section";

export default function Files() {
  const [progress, setProgress] = useState(0);

  return (
    <div className="space-y-6">
      <Section title="Upload Validation">
        <input type="file" className="text-sm" data-testid="file-input" />
        <div className="mt-2 text-xs text-black/60">Max 100MB, type validation, virus-simulated scan.</div>
      </Section>

      <Section title="Resumable Upload">
        <div className="w-full rounded border border-black/10 p-2">
          <div className="h-2 rounded bg-ember" style={{ width: `${progress}%` }} data-testid="upload-progress" />
        </div>
        <button
          className="mt-2 rounded border border-black/20 px-3 py-2"
          onClick={() => setProgress((prev) => (prev >= 100 ? 0 : prev + 20))}
          data-testid="upload-advance"
        >
          Advance chunk
        </button>
      </Section>

      <Section title="Download Center">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded border border-black/10 p-2">
            <span>report.csv</span>
            <button className="rounded border border-black/20 px-3 py-1" data-testid="download-csv">Download</button>
          </div>
          <div className="flex items-center justify-between rounded border border-black/10 p-2">
            <span>statement.pdf</span>
            <button className="rounded border border-black/20 px-3 py-1" data-testid="download-pdf">Download</button>
          </div>
          <div className="flex items-center justify-between rounded border border-black/10 p-2">
            <span>large-export.zip</span>
            <div className="flex gap-2">
              <button className="rounded border border-black/20 px-3 py-1" data-testid="download-retry">Retry</button>
              <button className="rounded border border-black/20 px-3 py-1" data-testid="download-resume">Resume</button>
            </div>
          </div>
          <div className="text-xs text-black/60">Checksum: SHA-256: demo-hash</div>
        </div>
      </Section>
    </div>
  );
}
