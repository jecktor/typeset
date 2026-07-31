import { useEffect, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import type { FormatterRegistry, ModelDescriptor } from '../core';
import { renderPdf, type AssetsInput } from '../render';
import { useEditor } from './store';

interface Props {
  assets?: AssetsInput;
  descriptor?: ModelDescriptor;
  formatters?: FormatterRegistry;
}

/**
 * WYSIWYG by construction: runs the REAL renderer against the model's sample
 * data and displays the resulting bytes. What you see here is the output.
 */
export function PreviewPane({ assets, descriptor, formatters }: Props) {
  const template = useEditor(s => s.template);
  const zoom = useEditor(s => s.zoom);
  const zoomMode = useEditor(s => s.zoomMode);
  const setFitZoom = useEditor(s => s.setFitZoom);
  const containerRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const timer = setTimeout(async () => {
      try {
        const collected: string[] = [];
        const bytes = await renderPdf({
          template,
          data: descriptor?.sample ?? {},
          assets,
          formatters,
          onWarning: w => collected.push(w)
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(
          new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
        );
        setUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
        setWarnings(collected);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [template, descriptor, assets, formatters]);

  useEffect(() => () => {
    setUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  // Same fit-to-view behavior as the edit canvas, so 'Ajustar' works here too.
  useEffect(() => {
    if (zoomMode !== 'fit') return;
    const el = containerRef.current;
    if (!el) return;
    const PADDING = 48;
    const fit = () => {
      const rect = el.getBoundingClientRect();
      const z = Math.min(
        (rect.width - PADDING) / template.pageSize.width,
        (rect.height - PADDING) / template.pageSize.height
      );
      if (z > 0) setFitZoom(z);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [zoomMode, template.pageSize.width, template.pageSize.height, setFitZoom]);

  return (
    <div className="pde-preview" ref={containerRef}>
      {error && <div className="pde-preview__error">Error: {error}</div>}
      {warnings.length > 0 && (
        <ul className="pde-preview__warnings">
          {warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
      {url && (
        <Document
          file={url}
          onLoadSuccess={doc => setNumPages(doc.numPages)}
          loading={<div className="pde-preview__loading">Generando PDF…</div>}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div key={i} className="pde-preview__page">
              <Page
                pageNumber={i + 1}
                width={template.pageSize.width * zoom}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
              <span className="pde-preview__pageno">
                {i + 1} / {numPages}
              </span>
            </div>
          ))}
        </Document>
      )}
    </div>
  );
}
