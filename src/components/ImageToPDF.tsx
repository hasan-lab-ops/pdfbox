"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Loader2, FileDown } from "lucide-react";

export default function ImageToPDF() {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setDownloadUrl(null);
      setError(null);
    }
  };

  const handleConvert = async () => {
    if (files.length === 0) {
      setError("Please select at least 1 image file.");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const pdfDoc = await PDFDocument.create();

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        let image;
        
        if (file.type === "image/jpeg" || file.type === "image/jpg") {
          image = await pdfDoc.embedJpg(arrayBuffer);
        } else if (file.type === "image/png") {
          image = await pdfDoc.embedPng(arrayBuffer);
        } else {
          throw new Error("Unsupported image format. Please use JPG or PNG.");
        }

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to convert images to PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '600px', width: '100%', margin: '0 auto', textAlign: 'center', padding: '48px 32px' }}>
      <h3 style={{ fontSize: '24px', marginBottom: '16px' }}>Image to PDF</h3>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '32px' }}>
        Convert JPG or PNG images to PDF in seconds.
      </p>

      <div style={{ marginBottom: '24px' }}>
        <input 
          type="file" 
          id="img-upload" 
          accept="image/jpeg, image/png, image/jpg" 
          multiple
          onChange={handleFileChange} 
          style={{ display: 'none' }} 
        />
        <label htmlFor="img-upload" className="btn-secondary" style={{ width: '100%' }}>
          Select Images
        </label>
      </div>

      {files.length > 0 && (
        <div style={{ textAlign: 'left', marginBottom: '24px', backgroundColor: 'var(--color-bg)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ marginBottom: '12px', color: 'var(--color-aqua)' }}>Selected Images ({files.length}):</h4>
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
          onClick={handleConvert} 
          disabled={isProcessing || files.length === 0}
          style={{ width: '100%', opacity: (isProcessing || files.length === 0) ? 0.5 : 1 }}
        >
          {isProcessing ? (
            <><Loader2 size={20} style={{ animation: 'spin 2s linear infinite' }} /> Converting...</>
          ) : (
            "Convert to PDF"
          )}
        </button>
      ) : (
        <a href={downloadUrl} download={`converted_images.pdf`} className="btn-primary" style={{ width: '100%', backgroundColor: '#00E5FF' }}>
          <FileDown size={20} /> Download PDF
        </a>
      )}
    </div>
  );
}
