import type { DocType, PageSize } from './types';

/** Page sizes in PDF points. */
export const DOC_TYPE_SIZES: Record<Exclude<DocType, 'custom'>, PageSize> = {
  carta: { width: 612, height: 792 },
  oficio: { width: 612, height: 936 }
};

export function pageSizeForDocType(
  docType: DocType,
  custom?: PageSize
): PageSize {
  if (docType === 'custom') {
    if (!custom) throw new Error("docType 'custom' requires an explicit pageSize");
    return custom;
  }
  return DOC_TYPE_SIZES[docType];
}
