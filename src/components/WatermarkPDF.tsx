"use client";

import { useState } from "react";
import { PDFDocument, rgb, degrees } from "pdf-lib";
import { Loader2, FileDown } from "lucide-react";

export default function WatermarkPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
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

  const handleWatermark = async () => {
    if (!file) return;

    try {
      setIsProcessing(true);
      setError(null);

      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();

      for (const page of pages) {
        const { width, height } = page.getSize();
        page.drawText(watermarkText, {
          x: width / 2 - 150,
          y: height / 2,
          size: 60,
          color: rgb(0.7, 0.7, 0.7),
          opacity: 0.5,
          rotate: degrees(-45),
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      console.error(err);
      setError("Failed to watermark the PDF. Make sure it is not encrypted.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '600px', width: '100%', margin: '0 auto', textAlign: 'center', padding: '48px 32px' }}>
      <h3 style={{ fontSize: '24px', marginBottom: '16px' }}>Watermark PDF</h3>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '32px' }}>
        Add a text watermark to every page of your PDF document.
      </p>

      <div style={{ marginBottom: '24px' }}>
        <input 
          type="file" 
          id="watermark-upload" 
          accept="application/pdf" 
          onChange={handleFileChange} 
          style={{ display: 'none' }} 
        />
        <label htmlFor="watermark-upload" className="btn-secondary" style={{ width: '100%' }}>
          Select PDF File
        </label>
      </div>

      {file && (
        <div style={{ textAlign: 'center', marginBottom: '24px', backgroundColor: 'var(--color-bg)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ marginBottom: '8px', color: 'var(--color-aqua)' }}>{file.name}</h4>
        </div>
      )}

      <div style={{ marginBottom: '32px', textAlign: 'left' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-muted)' }}>Watermark Text:</label>
        <input 
          type="text" 
          value={watermarkText} 
          onChange={(e) => setWatermarkText(e.target.value)}
          style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'white', fontSize: '16px' }}
        />
      </div>

      {error && (
        <div style={{ color: '#ff4d4d', marginBottom: '24px', padding: '12px', backgroundColor: 'rgba(255,77,77,0.1)', borderRadius: 'var(--radius-md)' }}>
          {error}
        </div>
      )}

      {!downloadUrl ? (
        <button 
          className="btn-primary" 
          onClick={handleWatermark} 
          disabled={isProcessing || !file || !watermarkText}
          style={{ width: '100%', opacity: (isProcessing || !file || !watermarkText) ? 0.5 : 1 }}
        >
          {isProcessing ? (
            <><Loader2 size={20} style={{ animation: 'spin 2s linear infinite' }} /> Processing...</>
          ) : (
            "Add Watermark"
          )}
        </button>
      ) : (
        <a href={downloadUrl} download={`${file?.name.replace('.pdf', '')}_watermarked.pdf`} className="btn-primary" style={{ width: '100%', backgroundColor: '#00E5FF' }}>
          <FileDown size={20} /> Download Watermarked PDF
        </a>
      )}
    </div>
  );
}
