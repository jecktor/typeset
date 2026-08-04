import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  FlowItem,
  FlowRegion,
  FlowSpec,
  Template,
  TemplateElement,
  ValueFormat
} from '../core';
import {
  alignRects,
  applyResize,
  distributeRects,
  frameToRect,
  rectToFrame,
  snapMovingRect,
  snapResizingRect,
  type AlignMode,
  type Rect,
  type ResizeCorner
} from './geometry';

export type ScopeTab = 'first' | 'middle' | 'last';
export type EditorMode = 'edit' | 'preview';

const HISTORY_LIMIT = 50;
/** Consecutive edits with the same action id within this window coalesce
 *  into one undo step (e.g. typing in a properties field). */
const COALESCE_MS = 800;

export interface PlacingSpec {
  kind: TemplateElement['kind'];
  label: string;
  binding?: string;
  format?: ValueFormat;
}

type InteractionState =
  | {
      target: 'element';
      kind: 'move';
      /** The grabbed element; the group snaps through it. */
      elementId: string;
      startX: number;
      startY: number;
      /** Frames of every selected element at pointerdown. */
      originals: Array<{ id: string; frame: TemplateElement['frame'] }>;
      /** True once the pointer produced a nonzero delta (drag vs tap). */
      moved: boolean;
      /** Tap on a multi-selected element collapses the selection to it. */
      collapseOnTap: boolean;
    }
  | {
      target: 'element';
      kind: 'resize';
      elementId: string;
      corner: ResizeCorner;
      startX: number;
      startY: number;
      original: TemplateElement['frame'];
    }
  | {
      target: 'region';
      kind: 'move' | 'resize';
      tab: 'first' | 'middle';
      startX: number;
      startY: number;
      original: FlowRegion;
    };

export interface EditorState {
  template: Template;
  history: Template[];
  future: Template[];
  zoom: number;
  /** 'fit' auto-scales the page to the canvas; any manual zoom switches to 'manual'. */
  zoomMode: 'fit' | 'manual';
  scopeTab: ScopeTab;
  mode: EditorMode;
  /** Selected element ids; more than one enables align/distribute. */
  selectedIds: string[];
  selectedFlowId: string | null;
  placing: PlacingSpec | null;
  interaction: InteractionState | null;
  /** Active alignment guides (page points) while dragging. */
  guides: { x: number[]; y: number[] } | null;
  /** Element currently being edited in place on the canvas. */
  editingId: string | null;
  /** Whether the dashed margin lines are drawn on the canvas. */
  showMargins: boolean;
  /** Bumped when a double-click asks the sidebar to spotlight its data control. */
  panelFocusNonce: number;
  /** True once the user has opened preview at least once (drives the nudge). */
  previewSeen: boolean;

  setTemplate(template: Template): void;
  patchTemplate(patch: Partial<Template>): void;
  updateElement(id: string, patch: Partial<TemplateElement>): void;
  addElement(element: TemplateElement): void;
  removeElement(id: string): void;
  /** Replaces the selection; with additive, toggles the id in/out of it. */
  select(id: string | null, additive?: boolean): void;
  selectFlowItem(id: string | null): void;
  /** Clears both element and flow-item selection. */
  deselect(): void;
  /** Removes every selected element in one undo step. */
  removeSelected(): void;
  alignSelected(mode: AlignMode): void;
  distributeSelected(axis: 'h' | 'v'): void;
  setZoom(zoom: number): void;
  /** Applied by the canvas while in fit mode; keeps zoomMode untouched. */
  setFitZoom(zoom: number): void;
  setZoomMode(mode: 'fit' | 'manual'): void;
  setScopeTab(tab: ScopeTab): void;
  setMode(mode: EditorMode): void;
  setPlacing(placing: PlacingSpec | null): void;
  setEditing(id: string | null): void;
  setShowMargins(show: boolean): void;
  requestPanelFocus(): void;

  undo(): void;
  redo(): void;

  enableFlow(): void;
  disableFlow(): void;
  updateRegion(tab: 'first' | 'middle', patch: Partial<FlowRegion>): void;
  addFlowItem(item: FlowItem): void;
  updateFlowItem(id: string, patch: Partial<FlowItem>): void;
  removeFlowItem(id: string): void;
  moveFlowItem(id: string, direction: -1 | 1): void;

  startInteraction(
    kind: 'move' | 'resize',
    elementId: string,
    x: number,
    y: number,
    corner?: ResizeCorner
  ): void;
  startRegionInteraction(
    kind: 'move' | 'resize',
    tab: 'first' | 'middle',
    x: number,
    y: number
  ): void;
  updateInteraction(x: number, y: number): void;
  endInteraction(): void;
}

function withFlow(template: Template, fn: (flow: FlowSpec) => FlowSpec): Template {
  if (!template.flow) return template;
  return { ...template, flow: fn(template.flow) };
}

/** Scopes visible on each tab: the tab's own scope plus 'all'. */
export function scopesForTab(tab: ScopeTab): Array<TemplateElement['scope']> {
  return [tab, 'all'];
}

export function createEditorStore(initial: Template): StoreApi<EditorState> {
  let lastCommit = { id: '', at: 0 };

  return createStore<EditorState>()((set, get) => {
    /** Apply a template change, recording an undo snapshot (coalesced). */
    const commit = (actionId: string, next: Template, extra: Partial<EditorState> = {}) =>
      set(state => {
        if (next === state.template) return extra;
        const now = Date.now();
        const coalesce =
          lastCommit.id === actionId && now - lastCommit.at < COALESCE_MS;
        lastCommit = { id: actionId, at: now };
        return {
          ...extra,
          template: next,
          history: coalesce
            ? state.history
            : [...state.history.slice(-(HISTORY_LIMIT - 1)), state.template],
          future: []
        };
      });

    /** Snapshot the current template before a drag begins. */
    const snapshot = (state: EditorState) => {
      lastCommit = { id: '', at: 0 };
      return {
        history: [...state.history.slice(-(HISTORY_LIMIT - 1)), state.template],
        future: [] as Template[]
      };
    };

    return {
      template: initial,
      history: [],
      future: [],
      zoom: 1,
      zoomMode: 'fit',
      scopeTab: 'first',
      mode: 'edit',
      selectedIds: [],
      selectedFlowId: null,
      placing: null,
      interaction: null,
      guides: null,
      editingId: null,
      showMargins: true,
      panelFocusNonce: 0,
      previewSeen: false,

      setTemplate: template =>
        set({ template, history: [], future: [], interaction: null, guides: null }),
      patchTemplate: patch =>
        commit('patch', { ...get().template, ...patch }),
      updateElement: (id, patch) =>
        commit(`el:${id}`, {
          ...get().template,
          elements: get().template.elements.map(el =>
            el.id === id ? ({ ...el, ...patch } as TemplateElement) : el
          )
        }),
      addElement: element =>
        commit(
          `add:${element.id}`,
          {
            ...get().template,
            elements: [...get().template.elements, element]
          },
          { selectedIds: [element.id], selectedFlowId: null, placing: null }
        ),
      removeElement: id =>
        commit(
          `rm:${id}`,
          {
            ...get().template,
            elements: get().template.elements.filter(el => el.id !== id)
          },
          {
            selectedIds: get().selectedIds.filter(s => s !== id),
            editingId: get().editingId === id ? null : get().editingId
          }
        ),
      removeSelected: () => {
        const state = get();
        if (state.selectedIds.length === 0) return;
        const ids = new Set(state.selectedIds);
        commit(
          'rm-selected',
          {
            ...state.template,
            elements: state.template.elements.filter(el => !ids.has(el.id))
          },
          {
            selectedIds: [],
            editingId:
              state.editingId && ids.has(state.editingId) ? null : state.editingId
          }
        );
      },
      select: (id, additive = false) =>
        set(state => {
          if (!id) return { selectedIds: [] };
          if (!additive) return { selectedIds: [id], selectedFlowId: null };
          return {
            selectedIds: state.selectedIds.includes(id)
              ? state.selectedIds.filter(s => s !== id)
              : [...state.selectedIds, id],
            selectedFlowId: null
          };
        }),
      setEditing: id => set({ editingId: id }),
      setShowMargins: show => set({ showMargins: show }),
      requestPanelFocus: () =>
        set(state => ({ panelFocusNonce: state.panelFocusNonce + 1 })),
      selectFlowItem: id =>
        set(id ? { selectedFlowId: id, selectedIds: [] } : { selectedFlowId: null }),
      deselect: () => set({ selectedIds: [], selectedFlowId: null }),
      alignSelected: mode => {
        const state = get();
        const { height: pageH } = state.template.pageSize;
        const els = state.template.elements.filter(el =>
          state.selectedIds.includes(el.id)
        );
        if (els.length < 2) return;
        const next = alignRects(
          els.map(el => frameToRect(el.frame, pageH)),
          mode
        );
        const frameById = new Map(
          els.map((el, i) => [el.id, rectToFrame(next[i]!, el.frame.anchor, pageH)])
        );
        commit(`align:${mode}`, {
          ...state.template,
          elements: state.template.elements.map(el =>
            frameById.has(el.id)
              ? ({ ...el, frame: frameById.get(el.id)! } as TemplateElement)
              : el
          )
        });
      },
      distributeSelected: axis => {
        const state = get();
        const { height: pageH } = state.template.pageSize;
        const els = state.template.elements.filter(el =>
          state.selectedIds.includes(el.id)
        );
        if (els.length < 3) return;
        const next = distributeRects(
          els.map(el => frameToRect(el.frame, pageH)),
          axis
        );
        const frameById = new Map(
          els.map((el, i) => [el.id, rectToFrame(next[i]!, el.frame.anchor, pageH)])
        );
        commit(`distribute:${axis}`, {
          ...state.template,
          elements: state.template.elements.map(el =>
            frameById.has(el.id)
              ? ({ ...el, frame: frameById.get(el.id)! } as TemplateElement)
              : el
          )
        });
      },
      setZoom: zoom =>
        set({ zoom: Math.min(3, Math.max(0.25, zoom)), zoomMode: 'manual' }),
      setFitZoom: zoom => {
        const next = Math.min(3, Math.max(0.25, zoom));
        if (Math.abs(next - get().zoom) < 0.005) return;
        set({ zoom: next });
      },
      setZoomMode: zoomMode => set({ zoomMode }),
      setScopeTab: tab => set({ scopeTab: tab, selectedIds: [] }),
      setMode: mode =>
        set(state => ({
          mode,
          previewSeen: state.previewSeen || mode === 'preview'
        })),
      setPlacing: placing => set({ placing }),

      undo: () =>
        set(state => {
          const prev = state.history[state.history.length - 1];
          if (!prev) return {};
          lastCommit = { id: '', at: 0 };
          return {
            template: prev,
            history: state.history.slice(0, -1),
            future: [state.template, ...state.future].slice(0, HISTORY_LIMIT),
            interaction: null,
            guides: null
          };
        }),
      redo: () =>
        set(state => {
          const [next, ...rest] = state.future;
          if (!next) return {};
          lastCommit = { id: '', at: 0 };
          return {
            template: next,
            history: [...state.history.slice(-(HISTORY_LIMIT - 1)), state.template],
            future: rest,
            interaction: null,
            guides: null
          };
        }),

      enableFlow: () => {
        const state = get();
        if (state.template.flow) return;
        const { width, height } = state.template.pageSize;
        const margin = 56;
        const region = {
          x: margin,
          yTop: 140,
          yBottom: height - 90,
          width: width - margin * 2
        };
        commit('flow:enable', {
          ...state.template,
          flow: {
            regions: { first: region, middle: { ...region, yTop: 100 } },
            stack: []
          }
        });
      },
      disableFlow: () =>
        commit(
          'flow:disable',
          { ...get().template, flow: undefined },
          { selectedFlowId: null }
        ),
      updateRegion: (tab, patch) =>
        commit(
          `region:${tab}`,
          withFlow(get().template, flow => ({
            ...flow,
            regions: { ...flow.regions, [tab]: { ...flow.regions[tab], ...patch } }
          }))
        ),
      addFlowItem: item =>
        commit(
          `fl-add:${item.id}`,
          withFlow(get().template, flow => ({
            ...flow,
            stack: [...flow.stack, item]
          })),
          { selectedFlowId: item.id, selectedIds: [] }
        ),
      updateFlowItem: (id, patch) =>
        commit(
          `fl:${id}`,
          withFlow(get().template, flow => ({
            ...flow,
            stack: flow.stack.map(it =>
              it.id === id ? ({ ...it, ...patch } as FlowItem) : it
            )
          }))
        ),
      removeFlowItem: id =>
        commit(
          `fl-rm:${id}`,
          withFlow(get().template, flow => ({
            ...flow,
            stack: flow.stack.filter(it => it.id !== id)
          })),
          { selectedFlowId: get().selectedFlowId === id ? null : get().selectedFlowId }
        ),
      moveFlowItem: (id, direction) =>
        commit(
          `fl-mv:${id}`,
          withFlow(get().template, flow => {
            const idx = flow.stack.findIndex(it => it.id === id);
            const to = idx + direction;
            if (idx < 0 || to < 0 || to >= flow.stack.length) return flow;
            const stack = [...flow.stack];
            const [item] = stack.splice(idx, 1);
            stack.splice(to, 0, item!);
            return { ...flow, stack };
          })
        ),

      startInteraction: (kind, elementId, x, y, corner) => {
        const state = get();
        const el = state.template.elements.find(e => e.id === elementId);
        if (!el) return;
        if (kind === 'resize') {
          set({
            ...snapshot(state),
            selectedIds: [elementId],
            selectedFlowId: null,
            interaction: {
              target: 'element',
              kind,
              elementId,
              corner: corner!,
              startX: x,
              startY: y,
              original: { ...el.frame }
            }
          });
          return;
        }
        // Grabbing a selected element drags the whole selection along.
        const inSelection = state.selectedIds.includes(elementId);
        const group = inSelection ? state.selectedIds : [elementId];
        set({
          ...snapshot(state),
          selectedIds: group,
          selectedFlowId: null,
          interaction: {
            target: 'element',
            kind,
            elementId,
            startX: x,
            startY: y,
            originals: state.template.elements
              .filter(e => group.includes(e.id))
              .map(e => ({ id: e.id, frame: { ...e.frame } })),
            moved: false,
            collapseOnTap: inSelection && state.selectedIds.length > 1
          }
        });
      },
      startRegionInteraction: (kind, tab, x, y) => {
        const state = get();
        const region = state.template.flow?.regions[tab];
        if (!region) return;
        set({
          ...snapshot(state),
          interaction: {
            target: 'region',
            kind,
            tab,
            startX: x,
            startY: y,
            original: { ...region }
          }
        });
      },
      updateInteraction: (x, y) => {
        const state = get();
        const { interaction, template } = state;
        if (!interaction) return;
        const dx = x - interaction.startX;
        const dy = y - interaction.startY;
        const { width: pageW, height: pageH } = template.pageSize;

        // Drag updates bypass commit(): startInteraction already snapshotted.
        const setTemplateRaw = (next: Template, guides: EditorState['guides']) =>
          set({ template: next, guides });

        if (interaction.target === 'element') {
          // Snap against the other elements visible on this tab + region and
          // margin edges. Every moving element is excluded as a target.
          const movingIds = new Set(
            interaction.kind === 'move'
              ? interaction.originals.map(o => o.id)
              : [interaction.elementId]
          );
          const visible = scopesForTab(state.scopeTab);
          const targets = template.elements
            .filter(e => !movingIds.has(e.id) && visible.includes(e.scope))
            .map(e => frameToRect(e.frame, pageH));
          const region =
            state.scopeTab !== 'last' ? template.flow?.regions[state.scopeTab] : undefined;
          if (region) {
            targets.push({
              x: region.x,
              y: region.yTop,
              width: region.width,
              height: region.yBottom - region.yTop
            });
          }
          const margins = template.margins;
          if (margins) {
            targets.push({
              x: margins.left,
              y: margins.top,
              width: pageW - margins.left - margins.right,
              height: pageH - margins.top - margins.bottom
            });
          }

          if (interaction.kind === 'resize') {
            const resized = applyResize(
              interaction.original,
              interaction.corner,
              dx,
              dy,
              pageH
            );
            if (!resized) return;
            const rect = frameToRect(resized, pageH);
            const snapped = snapResizingRect(
              rect,
              interaction.corner,
              targets,
              pageW,
              pageH
            );
            const frame = rectToFrame(snapped.rect, resized.anchor, pageH);
            setTemplateRaw(
              {
                ...template,
                elements: template.elements.map(el =>
                  el.id === interaction.elementId
                    ? ({ ...el, frame } as TemplateElement)
                    : el
                )
              },
              { x: snapped.guidesX, y: snapped.guidesY }
            );
            return;
          }

          // Group move: one shared delta, clamped so the selection's bounding
          // box stays on the page, snapped through the grabbed element.
          const rects = interaction.originals.map(o => ({
            id: o.id,
            rect: frameToRect(o.frame, pageH)
          }));
          const minX = Math.min(...rects.map(r => r.rect.x));
          const maxX = Math.max(...rects.map(r => r.rect.x + r.rect.width));
          const minY = Math.min(...rects.map(r => r.rect.y));
          const maxY = Math.max(...rects.map(r => r.rect.y + r.rect.height));
          const clamp = (v: number, lo: number, hi: number) =>
            Math.min(Math.max(v, lo), Math.max(lo, hi));
          const cdx = clamp(dx, -minX, pageW - maxX);
          const cdy = clamp(dy, -minY, pageH - maxY);
          const grabbed =
            rects.find(r => r.id === interaction.elementId) ?? rects[0]!;
          const anchorRect: Rect = {
            ...grabbed.rect,
            x: grabbed.rect.x + cdx,
            y: grabbed.rect.y + cdy
          };
          const snapped = snapMovingRect(anchorRect, targets, pageW, pageH);
          const sdx = cdx + (snapped.rect.x - anchorRect.x);
          const sdy = cdy + (snapped.rect.y - anchorRect.y);
          const frameById = new Map(
            interaction.originals.map(o => {
              const r = frameToRect(o.frame, pageH);
              return [
                o.id,
                rectToFrame(
                  { ...r, x: r.x + sdx, y: r.y + sdy },
                  o.frame.anchor,
                  pageH
                )
              ];
            })
          );
          set({
            template: {
              ...template,
              elements: template.elements.map(el =>
                frameById.has(el.id)
                  ? ({ ...el, frame: frameById.get(el.id)! } as TemplateElement)
                  : el
              )
            },
            guides: { x: snapped.guidesX, y: snapped.guidesY },
            interaction:
              interaction.moved || dx !== 0 || dy !== 0
                ? { ...interaction, moved: true }
                : interaction
          });
          return;
        }

        const o = interaction.original;
        let patch: Partial<FlowRegion>;
        if (interaction.kind === 'move') {
          const height = o.yBottom - o.yTop;
          const nx = Math.min(Math.max(0, o.x + dx), Math.max(0, pageW - o.width));
          const nyTop = Math.min(Math.max(0, o.yTop + dy), Math.max(0, pageH - height));
          patch = { x: nx, yTop: nyTop, yBottom: nyTop + height };
        } else {
          const width = Math.max(60, Math.min(o.width + dx, pageW - o.x));
          const yBottom = Math.max(o.yTop + 40, Math.min(o.yBottom + dy, pageH));
          patch = { width, yBottom };
        }
        setTemplateRaw(
          withFlow(template, flow => ({
            ...flow,
            regions: {
              ...flow.regions,
              [interaction.tab]: { ...flow.regions[interaction.tab], ...patch }
            }
          })),
          null
        );
      },
      endInteraction: () =>
        set(state => {
          const it = state.interaction;
          const next: Partial<EditorState> = { interaction: null, guides: null };
          if (it?.target === 'element' && it.kind === 'move' && !it.moved) {
            // Tap, not a drag: the template didn't change, so drop the
            // snapshot pushed at pointerdown (keeps undo meaningful)...
            next.history = state.history.slice(0, -1);
            // ...and clicking one element of a multi-selection singles it out.
            if (it.collapseOnTap) next.selectedIds = [it.elementId];
          }
          return next;
        })
    };
  });
}

export const EditorContext = createContext<StoreApi<EditorState> | null>(null);

export function useEditor<T>(selector: (state: EditorState) => T): T {
  const store = useContext(EditorContext);
  if (!store) throw new Error('useEditor must be used inside <TemplateEditor>');
  return useStore(store, selector);
}

export function newElementId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `el-${uuid ?? Math.random().toString(36).slice(2, 10)}`;
}

export function newFlowId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `fl-${uuid ?? Math.random().toString(36).slice(2, 10)}`;
}
