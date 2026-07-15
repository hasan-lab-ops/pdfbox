import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PDF BOX | Professional PDF Toolkit",
  description: "A premium, functional toolkit for merging, splitting, protecting, and converting PDFs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header style={{ padding: '24px 0', borderBottom: '1px solid var(--color-border)', backgroundColor: 'rgba(11, 19, 43, 0.8)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 100 }}>
          <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--color-aqua)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-navy)', fontWeight: 'bold', fontSize: '20px' }}>
                PB
              </div>
              <h1 style={{ fontSize: '24px', margin: 0, letterSpacing: '1px' }}>PDF <span className="text-aqua">BOX</span></h1>
            </div>
            <nav style={{ display: 'flex', gap: '24px' }}>
              <a href="/" style={{ fontWeight: 500, transition: 'var(--transition-fast)' }} onMouseOver={(e) => e.currentTarget.style.color = 'var(--color-aqua)'} onMouseOut={(e) => e.currentTarget.style.color = 'inherit'}>Tools</a>
              <a href="#" style={{ fontWeight: 500, transition: 'var(--transition-fast)' }} onMouseOver={(e) => e.currentTarget.style.color = 'var(--color-aqua)'} onMouseOut={(e) => e.currentTarget.style.color = 'inherit'}>Pricing</a>
              <a href="#" style={{ fontWeight: 500, transition: 'var(--transition-fast)' }} onMouseOver={(e) => e.currentTarget.style.color = 'var(--color-aqua)'} onMouseOut={(e) => e.currentTarget.style.color = 'inherit'}>API</a>
            </nav>
          </div>
        </header>
        <main style={{ flex: 1, padding: '48px 0' }}>
          {children}
        </main>
        <footer style={{ borderTop: '1px solid var(--color-border)', padding: '48px 0', backgroundColor: 'var(--color-navy-light)' }}>
          <div className="container text-center" style={{ color: 'var(--color-text-muted)' }}>
            <p>© {new Date().getFullYear()} PDF BOX. All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
