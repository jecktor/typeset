import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'core/index': 'src/core/index.ts',
    'render/index': 'src/render/index.ts',
    'editor/index': 'src/editor/index.ts',
    'module/index': 'src/module/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'pdf-lib',
    '@pdf-lib/fontkit',
    'zod',
    'react',
    'react-dom',
    'react-pdf',
    'pdfjs-dist'
  ]
});
