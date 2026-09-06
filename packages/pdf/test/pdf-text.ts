import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfSummary {
  pages: number;
  title: string | undefined;
  /** One entry per page: text items joined by " | ", so a snapshot shows the reading order. */
  text: string[];
  /** Link annotations across all pages, in order. */
  links: string[];
}

/** Reads a rendered PDF back through pdf.js, the same parser browsers use. */
export async function summarizePdf(bytes: Uint8Array): Promise<PdfSummary> {
  const pdf = await getDocument({ data: bytes, verbosity: 0, disableFontFace: true }).promise;
  const meta = await pdf.getMetadata();
  const text: string[] = [];
  const links: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    for (const a of (await page.getAnnotations()) as { subtype?: string; url?: string }[]) {
      if (a.subtype === 'Link' && a.url) links.push(a.url);
    }
    const content = await page.getTextContent();
    text.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter((s) => s.trim().length > 0)
        .join(' | '),
    );
  }
  const info = meta.info as { Title?: string } | undefined;
  return { pages: pdf.numPages, title: info?.Title, text, links };
}
