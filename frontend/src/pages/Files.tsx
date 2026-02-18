import React, { useState } from "react";
import Section from "../components/Section";
import { apiFetch, API_BASE } from "../utils/api";

export default function Files() {
  const [progress, setProgress] = useState(0);
  const [uploadId] = useState(`upload-${Date.now()}`);
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [downloadStatus, setDownloadStatus] = useState("idle");

  const totalChunks = 5;

  const advanceChunk = async () => {
    const next = Math.min(totalChunks, Math.floor(progress / 20) + 1);
    const response = await apiFetch(`${API_BASE}/api/upload/chunk`, {
      method: "POST",
      headers: {
        "upload-id": uploadId,
        "chunk-index": String(next),
        "total-chunks": String(totalChunks)
      }
    }).then((res) => res.json());
    setProgress(Math.min(100, next * 20));
    setUploadStatus(`received ${response.received}/${response.total}`);
    if (response.received >= totalChunks) {
      const complete = await apiFetch(`${API_BASE}/api/upload/complete`, {
        method: "POST",
        headers: { "upload-id": uploadId }
      }).then((res) => res.json());
      setUploadStatus(complete.complete ? "complete" : "incomplete");
    }
  };

  const triggerDownload = async (id: string, checksum: "good" | "bad") => {
    const response = await apiFetch(`${API_BASE}/api/download/${id}?checksum=${checksum === "bad" ? "bad" : "good"}`);
    const header = response.headers.get("X-Checksum-Sha256") ?? "none";
    setDownloadStatus(`status:${response.status} checksum:${header}`);
  };

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
          onClick={advanceChunk}
          data-testid="upload-advance"
          data-playwright="upload-advance"
          data-selenium="upload-advance"
        >
          Advance chunk
        </button>
        <div className="mt-2 text-xs text-black/60" data-testid="upload-status">{uploadStatus}</div>
      </Section>

      <Section title="Download Center">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded border border-black/10 p-2">
            <span>report.csv</span>
            <button
              className="rounded border border-black/20 px-3 py-1"
              onClick={() => triggerDownload("report", "good")}
              data-testid="download-csv"
              data-qa="download-csv"
            >
              Download
            </button>
          </div>
          <div className="flex items-center justify-between rounded border border-black/10 p-2">
            <span>statement.pdf</span>
            <button
              className="rounded border border-black/20 px-3 py-1"
              onClick={() => triggerDownload("statement", "good")}
              data-testid="download-pdf"
            >
              Download
            </button>
          </div>
          <div className="flex items-center justify-between rounded border border-black/10 p-2">
            <span>large-export.zip</span>
            <div className="flex gap-2">
              <button
                className="rounded border border-black/20 px-3 py-1"
                onClick={() => triggerDownload("large-export", "bad")}
                data-testid="download-retry"
              >
                Retry
              </button>
              <button
                className="rounded border border-black/20 px-3 py-1"
                onClick={() => triggerDownload("large-export", "good")}
                data-testid="download-resume"
              >
                Resume
              </button>
            </div>
          </div>
          <div className="text-xs text-black/60">Checksum: SHA-256: demo-hash</div>
          <div className="text-xs text-black/60" data-testid="download-status">{downloadStatus}</div>
        </div>
      </Section>
    </div>
  );
}
