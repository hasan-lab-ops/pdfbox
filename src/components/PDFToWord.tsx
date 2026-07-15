"use client";

import { useState } from "react";
import { Loader2, FileDown, AlertCircle } from "lucide-react";

export default function PDFToWord() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setDownloadUrl(null);
      setError(null);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    try {
      setIsProcessing(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/pdf-to-word", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Conversion failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to convert PDF to Word.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '600px', width: '100%', margin: '0 auto', textAlign: 'center', padding: '48px 32px' }}>
      <h3 style={{ fontSize: '24px', marginBottom: '16px' }}>PDF to Word</h3>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>
        Extract text from your PDF to a DOCX file. Includes basic support for Arabic.
      </p>

      <div style={{ backgroundColor: 'rgba(0, 229, 255, 0.05)', border: '1px solid var(--color-aqua)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '32px', display: 'flex', gap: '12px', alignItems: 'flex-start', textAlign: 'left' }}>
        <AlertCircle className="text-aqua" style={{ flexShrink: 0 }} />
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: 0 }}>
          <strong>Note:</strong> This tool extracts text and structures it into Word paragraphs. Complex layouts and images might not be preserved perfectly.
        </p>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <input 
          type="file" 
          id="ptw-upload" 
          accept="application/pdf" 
          onChange={handleFileChange} 
          style={{ display: 'none' }} 
        />
        <label htmlFor="ptw-upload" className="btn-secondary" style={{ width: '100%' }}>
          Select PDF File
        </label>
      </div>

      {file && (
        <div style={{ textAlign: 'center', marginBottom: '24px', backgroundColor: 'var(--color-bg)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ marginBottom: '8px', color: 'var(--color-aqua)' }}>{file.name}</h4>
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
          onClick={handleConvert} 
          disabled={isProcessing || !file}
          style={{ width: '100%', opacity: (isProcessing || !file) ? 0.5 : 1 }}
        >
          {isProcessing ? (
            <><Loader2 size={20} style={{ animation: 'spin 2s linear infinite' }} /> Converting...</>
          ) : (
            "Convert to Word"
          )}
        </button>
      ) : (
        <a href={downloadUrl} download={`${file?.name.replace('.pdf', '')}.docx`} className="btn-primary" style={{ width: '100%', backgroundColor: '#00E5FF' }}>
          <FileDown size={20} /> Download Word Document
        </a>
      )}
    </div>
  );
}
