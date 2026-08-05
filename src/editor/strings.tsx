/**
 * Editor UI strings and the seam for localizing them.
 *
 * Components read their labels through useEditorStrings() and hosts override
 * any of them with TemplateEditor's `strings` prop, exactly as the templates
 * module already does for its own chrome. The editor's older labels are still
 * written inline; they move here as the components around them are touched,
 * so this object is deliberately partial rather than a full catalogue.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

export const DEFAULT_EDITOR_STRINGS = {
  // Table columns
  columnContent: 'Contenido',
  columnContentText: 'Texto',
  columnContentImage: 'Imagen',
  columnImageHeight: 'Alto de imagen',
  columnMoveEarlier: 'Mover antes (hacia la izquierda de la tabla)',
  columnMoveLater: 'Mover después (hacia la derecha de la tabla)',
  addImageColumn: '+ Añadir columna de imagen',
  imageColumnLabel: 'Imagen',
  // Product images in table rows
  tableImagesTitle: 'Imágenes de producto',
  tableIncludeImages: 'Incluir imágenes',
  tableIncludeImagesHint:
    'Al apagarlo, las columnas de imagen no se imprimen y el resto de la tabla ocupa su lugar. Quien genera el documento puede decidirlo de nuevo en cada uno.',
  tableNoImageColumn:
    'Ninguna columna muestra imágenes todavía: añade una columna de imagen.',
  tableFallbackImage: 'Imagen por defecto',
  tableFallbackImageHint:
    'Se usa en las partidas cuyo producto no tiene foto. Sin una propia se usa la que trae el sistema.',
  tableFallbackImageReset: 'Usar la del sistema'
};

export type EditorStrings = typeof DEFAULT_EDITOR_STRINGS;

const EditorStringsContext = createContext<EditorStrings>(DEFAULT_EDITOR_STRINGS);

export function EditorStringsProvider({
  value,
  children
}: {
  value?: Partial<EditorStrings>;
  children: ReactNode;
}) {
  const merged = useMemo(
    () => ({ ...DEFAULT_EDITOR_STRINGS, ...value }),
    [value]
  );
  return (
    <EditorStringsContext.Provider value={merged}>
      {children}
    </EditorStringsContext.Provider>
  );
}

export const useEditorStrings = (): EditorStrings =>
  useContext(EditorStringsContext);
