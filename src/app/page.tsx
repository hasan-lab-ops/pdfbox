"use client";

import { useState } from "react";
import MergePDF from "@/components/MergePDF";
import SplitPDF from "@/components/SplitPDF";
import WatermarkPDF from "@/components/WatermarkPDF";
import ImageToPDF from "@/components/ImageToPDF";
import PDFToWord from "@/components/PDFToWord";
import { 
  FilePlus2, 
  SplitSquareHorizontal, 
  FileText, 
  Image as ImageIcon,
  Lock,
  Unlock,
  Stamp,
  FileImage,
  Loader2
} from "lucide-react";

export default function Home() {
  const tools = [
    { id: "merge", name: "Merge PDF", icon: <FilePlus2 size={32} />, desc: "Combine multiple PDFs into one unified document.", available: true },
    { id: "split", name: "Split PDF", icon: <SplitSquareHorizontal size={32} />, desc: "Separate one page or a whole set for easy conversion into independent PDF files.", available: true },
    { id: "pdf-to-word", name: "PDF to Word", icon: <FileText size={32} />, desc: "Convert your PDF to Word documents with incredible accuracy, supporting Arabic.", available: true },
    { id: "word-to-pdf", name: "Word to PDF", icon: <FileText size={32} />, desc: "Make DOC and DOCX files easy to read by converting them to PDF.", available: true },
    { id: "pdf-to-image", name: "PDF to Image", icon: <FileImage size={32} />, desc: "Convert each PDF page into a JPG or extract all images contained in a PDF.", available: true },
    { id: "image-to-pdf", name: "Image to PDF", icon: <ImageIcon size={32} />, desc: "Convert JPG images to PDF in seconds. Easily adjust orientation and margins.", available: true },
    { id: "protect", name: "Protect PDF", icon: <Lock size={32} />, desc: "Encrypt your PDF with a password to prevent unauthorized access.", available: true },
    { id: "unlock", name: "Unlock PDF", icon: <Unlock size={32} />, desc: "Remove PDF password security, giving you the freedom to use your PDFs as you want.", available: true },
    { id: "watermark", name: "Watermark PDF", icon: <Stamp size={32} />, desc: "Stamp an image or text over your PDF in seconds. Choose the typography, transparency and position.", available: true }
  ];

  const [activeTool, setActiveTool] = useState<string | null>(null);

  if (activeTool) {
    const tool = tools.find(t => t.id === activeTool);
    return (
      <div className="container animate-fade-in">
        <button 
          className="btn-secondary mb-8" 
          onClick={() => setActiveTool(null)}
        >
          &larr; Back to Tools
        </button>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', backgroundColor: 'rgba(0, 229, 255, 0.1)', color: 'var(--color-aqua)', borderRadius: '20px', marginBottom: '24px' }}>
            {tool?.icon}
          </div>
          <h2 style={{ fontSize: '36px', marginBottom: '16px' }}>{tool?.name}</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '18px', maxWidth: '600px', margin: '0 auto' }}>{tool?.desc}</p>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {activeTool === 'merge' && <MergePDF />}
        {activeTool === 'split' && <SplitPDF />}
        {activeTool === 'watermark' && <WatermarkPDF />}
        {activeTool === 'image-to-pdf' && <ImageToPDF />}
        {activeTool === 'pdf-to-word' && <PDFToWord />}
        {['merge', 'split', 'watermark', 'image-to-pdf', 'pdf-to-word'].includes(activeTool) === false && (
          <div className="card" style={{ maxWidth: '600px', width: '100%', margin: '0 auto', textAlign: 'center', padding: '64px 32px' }}>
            <Loader2 size={48} className="text-aqua" style={{ animation: 'spin 2s linear infinite', margin: '0 auto 24px' }} />
            <h3>Coming Soon</h3>
            <p style={{ color: 'var(--color-text-muted)', marginTop: '12px' }}>This tool requires a backend conversion engine (like LibreOffice or Ghostscript) which is not currently installed on this system.</p>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}} />
      </div>
    );
  }

  return (
    <div className="container animate-fade-in">
      <div style={{ textAlign: 'center', marginBottom: '64px' }}>
        <h1 style={{ fontSize: '48px', marginBottom: '24px' }}>Every tool you need to work with PDFs in one place</h1>
        <p style={{ fontSize: '20px', color: 'var(--color-text-muted)', maxWidth: '800px', margin: '0 auto' }}>
          Every tool you need to use PDFs, at your fingertips. All are 100% FREE and easy to use! Merge, split, compress, convert, rotate, unlock and watermark PDFs with just a few clicks.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
        {tools.map((tool) => (
          <div 
            key={tool.id} 
            className="card" 
            style={{ cursor: 'pointer', textAlign: 'center', padding: '32px 24px' }}
            onClick={() => setActiveTool(tool.id)}
          >
            <div style={{ color: 'var(--color-aqua)', marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
              {tool.icon}
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>{tool.name}</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', lineHeight: 1.5 }}>{tool.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
