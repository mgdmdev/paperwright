import { renderSerializedDoc } from '@formepdf/core';
import { Document, Fixed, Page, serialize } from '@formepdf/react';
import type { FontRegistration } from '@formepdf/react';
import { resolveTree } from '../lib/resolve-tree';
import type { DocumentEngine, EngineDocument, EngineImage } from './engine';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const toDataUri = (image: EngineImage): string => `data:${image.mime};base64,${toBase64(image.data)}`;

/**
 * Forme: pages, fixed bands and repeating table headers are native, page numbers are text
 * placeholders inside a Fixed band. The tree is expanded to primitives with `resolveTree` first
 * because Forme's serializer calls components bare and cannot see React context.
 */
export function createFormeEngine(): DocumentEngine {
  return {
    name: 'forme',
    capabilities: {
      fixedHeaderFooter: true,
      repeatingTableHeader: true,
      pageNumbers: true,
      pdfA: true,
      svg: false,
      bidi: true,
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
          creator={doc.metadata.creator ?? 'paperwright'}
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
      const serialized = serialize(resolveTree(tree));
      return renderSerializedDoc(serialized as unknown as Record<string, unknown>);
    },
  };
}
