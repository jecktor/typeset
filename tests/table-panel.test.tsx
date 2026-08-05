/**
 * @vitest-environment jsdom
 *
 * The table panel drives the template through the editor store, so these
 * tests click the real controls and assert on the resulting template — the
 * layer between "the renderer draws images correctly" and "a user can ask
 * for them".
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createStarterTemplate,
  DEFAULT_IMAGE_HEIGHT,
  type ModelDescriptor,
  type TableFlowItem,
  type Template
} from '../src/core';
import { FlowItemPanel } from '../src/editor/FlowItemPanel';
import { createEditorStore, EditorContext } from '../src/editor/store';

const model: ModelDescriptor = {
  name: 'cotizacion',
  label: 'Cotización',
  fields: [
    { kind: 'scalar', key: 'folio', label: 'Folio', type: 'string' },
    {
      kind: 'list',
      key: 'items',
      label: 'Partidas',
      itemFields: [
        { key: 'photo', label: 'Foto', type: 'image-url' },
        { key: 'qty', label: 'Cantidad', type: 'number' },
        { key: 'description', label: 'Descripción', type: 'string' },
        { key: 'total', label: 'Total', type: 'currency' }
      ]
    }
  ],
  sample: {
    folio: 'COT-1',
    items: [{ photo: '', qty: 1, description: 'Producto', total: 100 }]
  }
};

beforeAll(() => {
  // The fallback thumbnail resolves asset bytes into an object URL.
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:placeholder');
  globalThis.URL.revokeObjectURL = vi.fn();
});

// Vitest only auto-cleans with `globals: true`; unmount by hand instead.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mountPanel(
  template: Template,
  onAssetUpload?: (file: File) => Promise<{ assetId: string }>
) {
  const store = createEditorStore(template);
  const tableId = template.flow!.stack.find(i => i.kind === 'table')!.id;
  store.getState().selectFlowItem(tableId);
  render(
    <EditorContext.Provider value={store}>
      <FlowItemPanel descriptor={model} onAssetUpload={onAssetUpload} />
    </EditorContext.Provider>
  );
  const table = (): TableFlowItem => {
    const item = store.getState().template.flow!.stack.find(i => i.id === tableId);
    if (item?.kind !== 'table') throw new Error('table vanished from the flow');
    return item;
  };
  return { store, table };
}

const starter = () =>
  createStarterTemplate({ id: 'tpl-1', docType: 'carta', descriptor: model });

/** The card for the column at `index`, by its numbered heading. */
const cardFor = (index: number, label: string) =>
  screen.getByText(`${index + 1}. ${label}`).closest('.pde-column-card') as HTMLElement;

describe('table panel — images switch', () => {
  it('turns product images off and back on', async () => {
    const user = userEvent.setup();
    const { table } = mountPanel(starter());
    expect(table().images).toEqual({ enabled: true });

    const toggle = screen.getByLabelText('Incluir imágenes');
    await user.click(toggle);
    expect(table().images?.enabled).toBe(false);

    await user.click(toggle);
    expect(table().images?.enabled).toBe(true);
  });

  it('hides the fallback controls while images are off', async () => {
    const user = userEvent.setup();
    mountPanel(starter(), async () => ({ assetId: 'up-1' }));
    expect(screen.getByText(/Se usa en las partidas/)).toBeTruthy();

    await user.click(screen.getByLabelText('Incluir imágenes'));
    expect(screen.queryByText(/Se usa en las partidas/)).toBeNull();
  });

  it('stores the uploaded default image and can restore the built-in one', async () => {
    const user = userEvent.setup();
    const onAssetUpload = vi.fn(async () => ({ assetId: 'upload-42' }));
    const { table } = mountPanel(starter(), onAssetUpload);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(
      input,
      new File(['x'], 'default.png', { type: 'image/png' })
    );
    expect(onAssetUpload).toHaveBeenCalledOnce();
    expect(table().images?.fallbackAssetId).toBe('upload-42');

    await user.click(screen.getByRole('button', { name: 'Usar la del sistema' }));
    expect(table().images?.fallbackAssetId).toBeUndefined();
  });

  it('warns when images are on but nothing shows them', async () => {
    const user = userEvent.setup();
    const template = starter();
    const table = template.flow!.stack.find(i => i.kind === 'table')!;
    if (table.kind === 'table') {
      table.columns = table.columns.filter(c => c.kind !== 'image');
    }
    mountPanel(template);
    expect(screen.getByText(/ninguna columna es de tipo imagen|añade una columna de imagen/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '+ Añadir columna de imagen' }));
    expect(screen.queryByText(/añade una columna de imagen/i)).toBeNull();
  });
});

describe('table panel — columns', () => {
  it('adds an image column bound to the model picture field', async () => {
    const user = userEvent.setup();
    const template = starter();
    const t = template.flow!.stack.find(i => i.kind === 'table')!;
    if (t.kind === 'table') t.columns = t.columns.filter(c => c.kind !== 'image');
    const { table } = mountPanel(template);

    await user.click(screen.getByRole('button', { name: '+ Añadir columna de imagen' }));
    const added = table().columns.at(-1)!;
    expect(added).toMatchObject({
      itemKey: 'photo',
      kind: 'image',
      align: 'center',
      imageHeight: DEFAULT_IMAGE_HEIGHT
    });
    expect(table().images?.enabled).toBe(true);
  });

  it('switches a text column to a picture and back', async () => {
    const user = userEvent.setup();
    const { table } = mountPanel(starter());
    const before = table().columns.findIndex(c => c.itemKey === 'description');

    const card = cardFor(before, 'Descripción');
    await user.selectOptions(within(card).getByLabelText('Contenido'), 'image');
    expect(table().columns[before]).toMatchObject({
      kind: 'image',
      align: 'center',
      imageHeight: DEFAULT_IMAGE_HEIGHT
    });
    // A picture has no text format to carry.
    expect(table().columns[before]!.format).toBeUndefined();
    // Flex would waste the row's width on a thumbnail.
    expect(table().columns[before]!.width).not.toBe('flex');

    await user.selectOptions(within(card).getByLabelText('Contenido'), 'text');
    expect(table().columns[before]!.kind).toBe('text');
  });

  it('offers image height instead of format on picture columns', async () => {
    const user = userEvent.setup();
    const { table } = mountPanel(starter());
    const card = cardFor(0, 'Foto');
    expect(within(card).queryByLabelText('Formato')).toBeNull();

    const height = within(card).getByLabelText('Alto de imagen');
    await user.clear(height);
    await user.type(height, '48');
    expect(table().columns[0]!.imageHeight).toBe(48);
  });

  it('converts a column when its field is switched to the picture field', async () => {
    const user = userEvent.setup();
    const { table } = mountPanel(starter());
    const i = table().columns.findIndex(c => c.itemKey === 'qty');

    await user.selectOptions(
      within(cardFor(i, 'Cantidad')).getByLabelText('Campo'),
      'photo'
    );
    // Both the binding and the kind change, in one edit.
    expect(table().columns[i]).toMatchObject({ itemKey: 'photo', kind: 'image' });
  });

  it('reorders columns and stops at the ends', async () => {
    const user = userEvent.setup();
    const { table } = mountPanel(starter());
    expect(table().columns.map(c => c.itemKey)).toEqual([
      'photo',
      'qty',
      'description',
      'total'
    ]);

    const up = (index: number, label: string) =>
      within(cardFor(index, label)).getByTitle(/Mover antes/);

    await user.click(up(2, 'Descripción'));
    expect(table().columns.map(c => c.itemKey)).toEqual([
      'photo',
      'description',
      'qty',
      'total'
    ]);

    // The ends cannot walk off the table.
    expect((up(0, 'Foto') as HTMLButtonElement).disabled).toBe(true);
    const last = within(cardFor(3, 'Total')).getByTitle(
      /Mover después/
    ) as HTMLButtonElement;
    expect(last.disabled).toBe(true);
  });
});
