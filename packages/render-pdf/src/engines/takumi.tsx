import { measure, render } from 'takumi-pdf';
import type { RenderOptions } from 'takumi-pdf';
import type { ReactElement } from 'react';
import { PT_TO_PX } from '../page';
import type { DocumentEngine, EngineDocument, EngineImage } from '../engine';

const px = (points: number) => Math.round(points * PT_TO_PX * 100) / 100;

/** Space between a band and the content edge, so a header never touches the first line. */
const BAND_GAP_PT = 12;

/**
 * Takumi: header and footer are render options, laid out at full page width inside the page
 * margin, so the band carries the horizontal margins itself and the vertical margin grows to
 * fit whatever the band measures. Page numbers are Takumi's counter primitives; `<thead>`
 * repeats natively.
 */
export function createTakumiEngine(): DocumentEngine {
  return {
    name: 'takumi',
    base: 'takumi',
    capabilities: {
      fixedHeaderFooter: true,
      repeatingTableHeader: true,
      pageNumbers: true,
      pdfA: true,
      bidi: false,
      browser: true,
    },
    imageSrc: (image: EngineImage) => `asset:${image.src}`,
    async render(doc: EngineDocument): Promise<Uint8Array> {
      const fonts: RenderOptions['fonts'] = doc.fonts.map((f) => ({
        name: f.family,
        weight: f.weight,
        style: f.style,
        data: f.data,
      }));
      const images = doc.images.map((i) => ({ src: `asset:${i.src}`, data: i.data }));
      const shared = { fonts, images, fontFamilies: [...doc.fontFamilies, 'sans-serif'], lang: doc.metadata.lang };
      const size = { width: px(doc.page.width), height: px(doc.page.height) };
      const { top, right, bottom, left } = doc.page.margins;

      const band = (tree: ReactElement, edge: 'top' | 'bottom') => (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            paddingLeft: px(left),
            paddingRight: px(right),
            paddingTop: edge === 'top' ? px(BAND_GAP_PT) : 0,
            paddingBottom: edge === 'bottom' ? px(BAND_GAP_PT) : 0,
          }}
        >
          {tree}
        </div>
      );
      const header = doc.header ? band(doc.header, 'top') : undefined;
      const footer = doc.footer ? band(doc.footer, 'bottom') : undefined;
      const headerHeight = header ? (await measure(header, { size, ...shared })).height : 0;
      const footerHeight = footer ? (await measure(footer, { size, ...shared })).height : 0;

      const body = (
        <div style={{ display: 'flex', flexDirection: 'column', fontFamily: doc.fontFamilies.join(', ') }}>{doc.body}</div>
      );
      const metadata: NonNullable<RenderOptions['metadata']> = {};
      if (doc.metadata.title) metadata.title = doc.metadata.title;
      if (doc.metadata.subject) metadata.description = doc.metadata.subject;
      if (doc.metadata.author) metadata.authors = [doc.metadata.author];
      metadata.creator = doc.metadata.creator ?? 'docform';

      const options: RenderOptions = {
        size,
        margin: {
          top: Math.max(px(top), headerHeight + px(BAND_GAP_PT)),
          right: px(right),
          bottom: Math.max(px(bottom), footerHeight + px(BAND_GAP_PT)),
          left: px(left),
        },
        header,
        footer,
        metadata,
        ...shared,
        ...(doc.pdfA ? { pdfa: '2b' as const } : {}),
      };
      return render(body, options);
    },
  };
}
