import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

/** Draws every page of a PDF onto a canvas, fitted to the available width, with crisp output on HiDPI screens. */
export function PdfPages({ bytes }: { bytes: ArrayBuffer | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bytes || !host.current) return;
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
        const width = Math.max(320, container.clientWidth - 48);
        const dpr = window.devicePixelRatio || 1;
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
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
  }, [bytes]);

  return (
    <div className="pages" ref={host} data-pages={pages}>
      {error ? <div className="empty">Could not display the PDF: {error}</div> : null}
    </div>
  );
}
