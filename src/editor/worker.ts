import { pdfjs } from 'react-pdf';

/**
 * Configure the pdfjs worker. Prefer passing an explicit `workerSrc` (e.g.
 * Vite: `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`).
 * The fallback uses an import.meta.url asset reference, which modern
 * bundlers rewrite; never a CDN.
 */
export function setupPdfWorker(workerSrc?: string): void {
  if (workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    return;
  }
  if (pdfjs.GlobalWorkerOptions.workerSrc) return;
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    // Host must call setupPdfWorker(url) or set GlobalWorkerOptions itself.
  }
}
