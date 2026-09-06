import { renderSerializedDoc } from '@formepdf/core';
import { Document, Fixed, Page, serialize } from '@formepdf/react';
import type { FontRegistration } from '@formepdf/react';
import { forme } from '@docform/react';
import type { DocumentEngine, EngineDocument, EngineImage } from '../engine';

const toDataUri = (image: EngineImage): string => `data:${image.mime};base64,${Buffer.from(image.data).toString('base64')}`;

/**
 * Forme: pages, fixed bands and repeating table headers are native, page numbers are text
 * placeholders inside a Fixed band. The tree is expanded to primitives with `resolveTree` first
 * because Forme's serializer calls components bare and cannot see React context.
 */
export function createFormeEngine(): DocumentEngine {
  return {
    name: 'forme',
    base: 'forme',
    capabilities: {
      fixedHeaderFooter: true,
      repeatingTableHeader: true,
      pageNumbers: true,
      pdfA: true,
      bidi: true,
      browser: true,
    },
    imageSrc: toDataUri,
    async render(doc: EngineDocument): Promise<Uint8Array> {
      const fonts: FontRegistration[] = doc.fonts.map((f) => ({
        family: f.family,
        src: f.data,
        fontWeight: f.weight,
        fontStyle: f.style,
      }));
      const tree = (
        <Document
          title={doc.metadata.title}
          author={doc.metadata.author}
          subject={doc.metadata.subject}
          creator={doc.metadata.creator ?? 'docform'}
          lang={doc.metadata.lang}
          fonts={fonts}
          pdfa={doc.pdfA ? '2b' : undefined}
          style={{ fontFamily: doc.fontFamilies[0] }}
        >
          <Page size={{ width: doc.page.width, height: doc.page.height }} margin={doc.page.margins}>
            {doc.header && <Fixed position="header">{doc.header}</Fixed>}
            {doc.footer && <Fixed position="footer">{doc.footer}</Fixed>}
            {doc.body}
          </Page>
        </Document>
      );
      const serialized = serialize(forme.resolveTree(tree));
      return renderSerializedDoc(serialized as unknown as Record<string, unknown>);
    },
  };
}
