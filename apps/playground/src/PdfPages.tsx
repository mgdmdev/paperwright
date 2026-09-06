import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

/** Draws every page of a PDF onto a canvas, fitted to the available width, with crisp output on HiDPI screens. */
export function PdfPages({ bytes }: { bytes: ArrayBuffer | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [width, setWidth] = useState(0);

  // Pages are fitted to the container, and refitted when it changes size or becomes visible.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!bytes || !host.current || width === 0) return;
    let cancelled = false;
    const container = host.current;
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
    (async () => {
      try {
        const pdf = await task.promise;
        if (cancelled) return;
        container.replaceChildren();
        setPages(pdf.numPages);
        setError(null);
        const pageWidth = Math.max(160, width - 48);
        const dpr = window.devicePixelRatio || 1;
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = pageWidth / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          canvas.className = 'page';
          container.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [bytes, width]);

  return (
    <div className="pages" ref={host} data-pages={pages}>
      {error ? <div className="empty">Could not display the PDF: {error}</div> : null}
    </div>
  );
}
