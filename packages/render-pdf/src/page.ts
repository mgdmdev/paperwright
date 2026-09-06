import type { DocumentModel, PageSize } from '@paperwright/model';
import type { PageGeometry } from './engine';

const SIZES: Record<Exclude<PageSize, object>, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
};

export const PT_TO_PX = 96 / 72;

export function pageGeometry(model: DocumentModel): PageGeometry {
  const base = typeof model.page.size === 'string' ? SIZES[model.page.size] : model.page.size;
  const landscape = model.page.orientation === 'landscape';
  return {
    width: landscape ? base.height : base.width,
    height: landscape ? base.width : base.height,
    margins: { ...model.page.margins },
  };
}
