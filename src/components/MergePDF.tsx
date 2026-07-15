"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Loader2, FileDown } from "lucide-react";

export default function MergePDF() {
  const [files, setFiles] = useState<File[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setDownloadUrl(null);
      setError(null);
    }
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      setError("Please select at least 2 PDF files to merge.");
      return;
    }

    try {
      setIsMerging(true);
      setError(null);

      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      console.error(err);
      setError("Failed to merge PDFs. Make sure they are valid PDF files.");
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', padding: '48px 32px' }}>
      <h3 style={{ fontSize: '24px', marginBottom: '16px' }}>Merge PDF Files</h3>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '32px' }}>
        Select multiple PDF files to combine them into a single document.
      </p>

      <div style={{ marginBottom: '32px' }}>
        <input
          type="file"
          id="merge-upload"
          accept="application/pdf"
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <label htmlFor="merge-upload" className="btn-secondary" style={{ width: '100%' }}>
          Select PDF Files
        </label>
      </div>

      {files.length > 0 && (
        <div style={{ textAlign: 'left', marginBottom: '32px', backgroundColor: 'var(--color-bg)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ marginBottom: '12px', color: 'var(--color-aqua)' }}>Selected Files ({files.length}):</h4>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {files.map((f, i) => (
              <li key={i} style={{ padding: '8px 0', borderBottom: i < files.length - 1 ? '1px solid var(--color-border)' : 'none', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {i + 1}. {f.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div style={{ color: '#ff4d4d', marginBottom: '24px', padding: '12px', backgroundColor: 'rgba(255,77,77,0.1)', borderRadius: 'var(--radius-md)' }}>
          {error}
        </div>
      )}

      {!downloadUrl ? (
        <button
          className="btn-primary"
          onClick={handleMerge}
          disabled={isMerging || files.length < 2}
          style={{ width: '100%', opacity: (isMerging || files.length < 2) ? 0.5 : 1 }}
        >
          {isMerging ? (
            <><Loader2 size={20} style={{ animation: 'spin 2s linear infinite' }} /> Merging...</>
          ) : (
            "Merge PDFs"
          )}
        </button>
      ) : (
        <a href={downloadUrl} download="merged-document.pdf" className="btn-primary" style={{ width: '100%', backgroundColor: '#00E5FF' }}>
          <FileDown size={20} /> Download Merged PDF
        </a>
      )}
    </div>
  );
}
