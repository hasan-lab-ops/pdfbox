"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { Loader2, FileDown } from "lucide-react";

export default function SplitPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setDownloadUrl(null);
      setError(null);

      // get page count
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        setPageCount(pdfDoc.getPageCount());
      } catch (err) {
        console.error(err);
        setError("Could not read the PDF file.");
      }
    }
  };

  const handleSplit = async () => {
    if (!file) {
      setError("Please select a PDF file to split.");
      return;
    }

    try {
      setIsSplitting(true);
      setError(null);

      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const zip = new JSZip();
      const totalPages = pdfDoc.getPageCount();

      for (let i = 0; i < totalPages; i++) {
        const newPdf = await PDFDocument.create();
        const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
        newPdf.addPage(copiedPage);
        const pdfBytes = await newPdf.save();
        zip.file(`split_page_${i + 1}.pdf`, pdfBytes);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      setDownloadUrl(url);
    } catch (err) {
      console.error(err);
      setError("Failed to split the PDF.");
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', padding: '48px 32px' }}>
      <h3 style={{ fontSize: '24px', marginBottom: '16px' }}>Split PDF</h3>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '32px' }}>
        Extract every page of your PDF into separate files. They will be downloaded as a ZIP archive.
      </p>

      <div style={{ marginBottom: '32px' }}>
        <input 
          type="file" 
          id="split-upload" 
          accept="application/pdf" 
          onChange={handleFileChange} 
          style={{ display: 'none' }} 
        />
        <label htmlFor="split-upload" className="btn-secondary" style={{ width: '100%' }}>
          Select PDF File
        </label>
      </div>

      {file && (
        <div style={{ textAlign: 'center', marginBottom: '32px', backgroundColor: 'var(--color-bg)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ marginBottom: '8px', color: 'var(--color-aqua)' }}>{file.name}</h4>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{pageCount} pages detected</p>
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
          onClick={handleSplit} 
          disabled={isSplitting || !file}
          style={{ width: '100%', opacity: (isSplitting || !file) ? 0.5 : 1 }}
        >
          {isSplitting ? (
            <><Loader2 size={20} style={{ animation: 'spin 2s linear infinite' }} /> Splitting...</>
          ) : (
            "Split PDF"
          )}
        </button>
      ) : (
        <a href={downloadUrl} download={`${file?.name.replace('.pdf', '')}_split.zip`} className="btn-primary" style={{ width: '100%', backgroundColor: '#00E5FF' }}>
          <FileDown size={20} /> Download ZIP Archive
        </a>
      )}
    </div>
  );
}
