import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'AI-Powered CSV Importer | CRM Lead Ingestion Engine',
  description: 'Enterprise-grade CSV ingestion pipeline. Upload messy CSV files, semantically map fields using LLMs, validate data with Zod, and deduplicate with high-precision server normalizers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100 min-h-screen antialiased selection:bg-brand-500 selection:text-white`}>
        {children}
      </body>
    </html>
  );
}
