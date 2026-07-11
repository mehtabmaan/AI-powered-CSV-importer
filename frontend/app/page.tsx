'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Sparkles, 
  Play, 
  FileText, 
  ArrowRight, 
  RotateCcw, 
  Database,
  Users,
  AlertOctagon,
  Clock
} from 'lucide-react';
import { VirtualizedTable, Column } from '../components/VirtualizedTable';

type Step = 'upload' | 'preview' | 'processing' | 'results';

interface MappedLead {
  _row: number;
  created_at: string;
  name: string;
  email: string;
  country_code: string;
  mobile_without_country_code: string;
  company: string;
  city: string;
  state: string;
  country: string;
  lead_owner: string;
  crm_status: string;
  crm_note: string;
  data_source: string;
  possession_time: string;
  description: string;
}

interface SkippedRecord {
  row: number;
  reason: string;
}

interface JobSummary {
  totalRows: number;
  processedRows: number;
  successCount: number;
  skippedCount: number;
  processingTimeMs: number;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
const MAX_UPLOAD_SIZE_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB || '20');

export default function LeadImporter() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  
  // Client preview data
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  // Job progress data
  const [jobId, setJobId] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [currentBatch, setCurrentBatch] = useState<number>(0);
  const [totalBatches, setTotalBatches] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Final Results
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [successList, setSuccessList] = useState<MappedLead[]>([]);
  const [skippedList, setSkippedList] = useState<SkippedRecord[]>([]);
  const [resultTab, setResultTab] = useState<'success' | 'skipped'>('success');

  // Handle Drag & Drop Upload
  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setErrorMsg('');
    
    if (fileRejections.length > 0) {
      const error = fileRejections[0].errors[0];
      if (error.code === 'file-too-large') {
        setErrorMsg(`File too large. Maximum size is ${MAX_UPLOAD_SIZE_MB}MB.`);
      } else {
        setErrorMsg(error.message);
      }
      return;
    }

    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    // Client-side PapaParse Preview
    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setErrorMsg('Malformed CSV structure detected. Failed to parse.');
          return;
        }

        if (results.data.length === 0) {
          setErrorMsg('CSV file is empty or contains headers only.');
          return;
        }

        setPreviewHeaders(results.meta.fields || []);
        // Inject row numbers to preview data
        const rowsWithIdx = results.data.map((row: any, idx) => ({
          ...row,
          _row: idx + 2,
        }));
        setPreviewRows(rowsWithIdx);
        setStep('preview');
      },
      error: (err) => {
        setErrorMsg(`Failed to parse CSV: ${err.message}`);
      }
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    multiple: false,
  });

  // Submit and SSE Progress Tracking
  const startIngest = async () => {
    if (!file) return;
    setErrorMsg('');
    setStep('processing');
    setProgress(0);
    setCurrentBatch(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/extract-leads`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || 'Server error uploading CSV');
      }

      const { jobId } = await res.json();
      setJobId(jobId);

      // Connect to SSE Endpoint
      const es = new EventSource(`${BACKEND_URL}/api/progress/${jobId}`);

      es.addEventListener('progress', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        setProgress(data.progress || 0);
        setCurrentBatch(data.currentBatch || 0);
        setTotalBatches(data.totalBatches || 0);
      });

      es.addEventListener('complete', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        setSummary(data.summary);
        setSuccessList(data.success);
        setSkippedList(data.skipped);
        setStep('results');
        es.close();
      });

      es.addEventListener('error', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        setErrorMsg(data.message || 'AI pipeline processing failed.');
        setStep('preview');
        es.close();
      });

      es.onerror = () => {
        // Suppress retry on normal termination, or handle disconnects
        console.warn('SSE disconnected.');
      };

    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit file to ingestion engine.');
      setStep('preview');
    }
  };

  const resetImporter = () => {
    setFile(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setJobId('');
    setProgress(0);
    setCurrentBatch(0);
    setSummary(null);
    setSuccessList([]);
    setSkippedList([]);
    setErrorMsg('');
    setStep('upload');
  };

  // Preview Columns (dynamic based on headers present)
  const previewColumns = useMemo<Column<any>[]>(() => {
    const cols: Column<any>[] = [
      {
        header: 'Line',
        accessor: (r) => <span className="font-mono text-xs text-slate-500">#{r._row}</span>,
        flex: 'w-[70px]',
      }
    ];

    // Grab first 5 headers from CSV
    previewHeaders.slice(0, 5).forEach((h) => {
      cols.push({
        header: h,
        accessor: (r) => r[h] || <span className="text-slate-600 italic">empty</span>,
        flex: 'flex-1',
      });
    });

    if (previewHeaders.length > 5) {
      cols.push({
        header: `+ ${previewHeaders.length - 5} More`,
        accessor: () => <span className="text-slate-500 font-medium">...</span>,
        flex: 'w-[100px]',
      });
    }

    return cols;
  }, [previewHeaders]);

  // Success Columns
  const successColumns: Column<MappedLead>[] = [
    {
      header: 'Row',
      accessor: (r) => <span className="font-mono text-slate-500">#{r._row}</span>,
      flex: 'w-[70px]',
    },
    {
      header: 'Name',
      accessor: (r) => r.name || <span className="text-slate-600 italic">-</span>,
      flex: 'w-[140px]',
    },
    {
      header: 'Email',
      accessor: (r) => <span className="text-brand-300 font-mono text-xs">{r.email}</span>,
      flex: 'w-[200px]',
    },
    {
      header: 'Phone',
      accessor: (r) => r.mobile_without_country_code ? (
        <span className="font-mono text-xs text-slate-300">
          {r.country_code ? `+${r.country_code} ` : ''}{r.mobile_without_country_code}
        </span>
      ) : (
        <span className="text-slate-600 italic">-</span>
      ),
      flex: 'w-[150px]',
    },
    {
      header: 'Status',
      accessor: (r) => {
        const colors: Record<string, string> = {
          GOOD_LEAD_FOLLOW_UP: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          DID_NOT_CONNECT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          BAD_LEAD: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          SALE_DONE: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
        };
        const cls = colors[r.crm_status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        return r.crm_status ? (
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
            {r.crm_status}
          </span>
        ) : (
          <span className="text-slate-600 italic">-</span>
        );
      },
      flex: 'w-[180px]',
    },
    {
      header: 'Source',
      accessor: (r) => r.data_source ? (
        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700">
          {r.data_source}
        </span>
      ) : (
        <span className="text-slate-600 italic">-</span>
      ),
      flex: 'w-[150px]',
    },
    {
      header: 'Company',
      accessor: (r) => r.company || <span className="text-slate-600 italic">-</span>,
      flex: 'flex-1',
    }
  ];

  // Skipped Columns
  const skippedColumns: Column<SkippedRecord>[] = [
    {
      header: 'Original Row',
      accessor: (r) => <span className="font-mono text-rose-400">Row #{r.row}</span>,
      flex: 'w-[150px]',
    },
    {
      header: 'Skip Reason',
      accessor: (r) => {
        const isError = ['AI extraction failed after retries', 'Schema validation failed', 'Malformed CSV row'].includes(r.reason);
        return (
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${isError ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className={`font-semibold ${isError ? 'text-rose-300' : 'text-amber-300'}`}>
              {r.reason}
            </span>
          </div>
        );
      },
      flex: 'flex-1',
    }
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-16">
      
      {/* Title & Brand Header */}
      <header className="mb-12 text-center relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-44 w-44 rounded-full bg-brand-500/10 blur-[80px]" />
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold mb-3 animate-fade-in">
          <Sparkles className="h-3 w-3" />
          Enterprise CRM Data Extraction Ingestor
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-100 via-brand-200 to-brand-500 mb-4">
          AI-Powered CSV Importer
        </h1>
        <p className="text-slate-400 max-w-lg mx-auto text-sm md:text-base leading-relaxed">
          Upload messy, unstructured CSV datasets. Automatically map fields semantically, validate structure, and ingest clean records instantly.
        </p>
      </header>

      {/* Main Glassmorphic Wrapper */}
      <main className="glass rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        
        {/* Stage Steps Indicator */}
        <div className="flex justify-between items-center max-w-xl mx-auto mb-8 border-b border-slate-800/40 pb-6 text-xs md:text-sm">
          {[
            { id: 'upload', label: 'Upload CSV' },
            { id: 'preview', label: 'Inspect Preview' },
            { id: 'processing', label: 'Ingesting & LLM Map' },
            { id: 'results', label: 'Extraction Results' }
          ].map((st, idx) => {
            const isActive = step === st.id;
            const isCompleted = 
              (step === 'preview' && idx < 1) ||
              (step === 'processing' && idx < 2) ||
              (step === 'results' && idx < 3);

            return (
              <div key={st.id} className="flex items-center gap-2">
                <span className={`h-6 w-6 rounded-full flex items-center justify-center font-bold border text-[10px] transition-all duration-300 ${
                  isActive ? 'bg-brand-500 border-brand-400 text-white shadow-[0_0_10px_rgba(139,92,246,0.3)]Scale' :
                  isCompleted ? 'bg-brand-900/50 border-brand-600 text-brand-300' :
                  'bg-slate-900 border-slate-800 text-slate-500'
                }`}>
                  {idx + 1}
                </span>
                <span className={`hidden md:inline font-medium ${isActive ? 'text-slate-100' : isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3 text-sm animate-shake">
            <AlertOctagon className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Execution Error:</span> {errorMsg}
            </div>
          </div>
        )}

        {/* STAGE 1: File Upload */}
        {step === 'upload' && (
          <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
            isDragActive ? 'border-brand-500 bg-brand-500/5' : 'border-slate-800 bg-slate-900/10 hover:border-slate-700/60'
          }`}>
            <input {...getInputProps()} />
            <div className="h-16 w-16 bg-brand-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-500/20 shadow-inner">
              <UploadCloud className="h-8 w-8 text-brand-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-100 mb-2">
              Drag & Drop your messy CSV file here
            </h3>
            <p className="text-slate-500 text-xs md:text-sm max-w-sm mx-auto mb-6">
              Only standard comma-separated values (.csv) format allowed. Maximum file size is {MAX_UPLOAD_SIZE_MB}MB.
            </p>
            <button className="px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 border border-brand-450 transition-all font-semibold text-xs shadow-md shadow-brand-500/10 inline-flex items-center gap-2">
              Browse Files
            </button>
          </div>
        )}

        {/* STAGE 2: Client Preview */}
        {step === 'preview' && file && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-slate-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200 truncate max-w-xs">{file.name}</h4>
                  <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB | {previewRows.length} total rows parsed</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={resetImporter}
                  className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded-lg text-xs font-semibold text-slate-400 flex items-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
                <button 
                  onClick={startIngest}
                  className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 font-semibold text-xs text-white border border-brand-450 shadow-md shadow-brand-500/20 flex items-center gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" />
                  Begin Pipeline
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mb-4 text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-brand-400" />
              Dataset Client-Side Preview (First 5 fields mapped to virtualization engine)
            </div>
            
            <VirtualizedTable data={previewRows} columns={previewColumns} height="360px" />
          </div>
        )}

        {/* STAGE 3: Ingestion Pipeline Processing */}
        {step === 'processing' && (
          <div className="py-12 max-w-md mx-auto text-center">
            <div className="relative mb-6 inline-block">
              <Loader2 className="h-16 w-16 text-brand-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Database className="h-6 w-6 text-brand-400" />
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-slate-100 mb-2">Ingesting CSV & Calling LLM...</h3>
            <p className="text-slate-400 text-xs mb-6 leading-relaxed">
              We are batching rows and executing Structured Outputs semantic mappings. Progress notifications are streaming via Server-Sent Events (SSE).
            </p>

            {/* Progress Visualizer */}
            <div className="w-full bg-slate-900 border border-slate-850 rounded-full h-3 mb-3 p-[2px]">
              <div 
                className="bg-gradient-to-r from-brand-600 to-brand-400 h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-xs font-mono text-slate-500 px-1">
              <span>Batch {currentBatch}/{totalBatches}</span>
              <span>{progress}% Completed</span>
            </div>
          </div>
        )}

        {/* STAGE 4: Ingestion Complete / Results View */}
        {step === 'results' && summary && (
          <div>
            
            {/* Header statistics block */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider flex items-center gap-1.5">
                  <Database className="h-3 w-3 text-slate-400" /> Total Rows
                </span>
                <span className="text-3xl font-extrabold text-slate-100 mt-2 font-mono">
                  {summary.totalRows}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-semibold text-emerald-400 tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" /> Successful Ingests
                </span>
                <span className="text-3xl font-extrabold text-emerald-300 mt-2 font-mono">
                  {summary.successCount}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-rose-500/10 bg-rose-500/5 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-semibold text-rose-400 tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" /> Skipped Records
                </span>
                <span className="text-3xl font-extrabold text-rose-300 mt-2 font-mono">
                  {summary.skippedCount}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-slate-400" /> Processing Speed
                </span>
                <span className="text-3xl font-extrabold text-slate-100 mt-2 font-mono">
                  {(summary.processingTimeMs / 1000).toFixed(2)}s
                </span>
              </div>

            </div>

            {/* Custom Tab Selector */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800/80 pb-4 gap-4 mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setResultTab('success')}
                  className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all flex items-center gap-2 ${
                    resultTab === 'success'
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'border-slate-800 hover:bg-slate-900 text-slate-400'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  Successfully Imported ({successList.length})
                </button>
                <button
                  onClick={() => setResultTab('skipped')}
                  className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all flex items-center gap-2 ${
                    resultTab === 'skipped'
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      : 'border-slate-800 hover:bg-slate-900 text-slate-400'
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Skipped Records ({skippedList.length})
                </button>
              </div>

              <button
                onClick={resetImporter}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 border border-brand-450 rounded-lg text-xs font-bold text-white transition-all inline-flex items-center gap-1.5 self-start md:self-auto"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Upload New Dataset
              </button>
            </div>

            {/* Results Virtualized Table */}
            {resultTab === 'success' ? (
              <VirtualizedTable data={successList} columns={successColumns} height="360px" />
            ) : (
              <VirtualizedTable data={skippedList} columns={skippedColumns} height="360px" />
            )}

          </div>
        )}

      </main>
      
      {/* Footer Branding */}
      <footer className="mt-8 text-center text-[10px] text-slate-600 font-mono tracking-widest uppercase">
        Stateless Processing Node | Version 1.0.0
      </footer>

    </div>
  );
}
