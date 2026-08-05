export { TemplateEditor, type TemplateEditorProps } from './TemplateEditor';
export { themeStyle, type EditorTheme } from './theme';
export {
  DEFAULT_EDITOR_STRINGS,
  EditorStringsProvider,
  useEditorStrings,
  type EditorStrings
} from './strings';
export { setupPdfWorker } from './worker';
export {
  applyMove,
  applyResize,
  frameToRect,
  rectToFrame,
  MIN_ELEMENT_SIZE,
  type Rect,
  type ResizeCorner
} from './geometry';
