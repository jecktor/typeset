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
  applyMove,
  applyResize,
  frameToRect,
  rectToFrame,
  snapMovingRect,
  snapResizingRect,
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
      kind: 'move' | 'resize';
      elementId: string;
      corner?: ResizeCorner;
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
  selectedId: string | null;
  selectedFlowId: string | null;
  placing: PlacingSpec | null;
  interaction: InteractionState | null;
  /** Active alignment guides (page points) while dragging. */
  guides: { x: number[]; y: number[] } | null;
  /** Element currently being edited in place on the canvas. */
  editingId: string | null;
  /** Bumped when a double-click asks the sidebar to spotlight its data control. */
  panelFocusNonce: number;
  /** True once the user has opened preview at least once (drives the nudge). */
  previewSeen: boolean;

  setTemplate(template: Template): void;
  patchTemplate(patch: Partial<Template>): void;
  updateElement(id: string, patch: Partial<TemplateElement>): void;
  addElement(element: TemplateElement): void;
  removeElement(id: string): void;
  select(id: string | null): void;
  selectFlowItem(id: string | null): void;
  setZoom(zoom: number): void;
  /** Applied by the canvas while in fit mode; keeps zoomMode untouched. */
  setFitZoom(zoom: number): void;
  setZoomMode(mode: 'fit' | 'manual'): void;
  setScopeTab(tab: ScopeTab): void;
  setMode(mode: EditorMode): void;
  setPlacing(placing: PlacingSpec | null): void;
  setEditing(id: string | null): void;
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
      selectedId: null,
      selectedFlowId: null,
      placing: null,
      interaction: null,
      guides: null,
      editingId: null,
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
          { selectedId: element.id, selectedFlowId: null, placing: null }
        ),
      removeElement: id =>
        commit(
          `rm:${id}`,
          {
            ...get().template,
            elements: get().template.elements.filter(el => el.id !== id)
          },
          {
            selectedId: get().selectedId === id ? null : get().selectedId,
            editingId: get().editingId === id ? null : get().editingId
          }
        ),
      select: id =>
        set(id ? { selectedId: id, selectedFlowId: null } : { selectedId: null }),
      setEditing: id => set({ editingId: id }),
      requestPanelFocus: () =>
        set(state => ({ panelFocusNonce: state.panelFocusNonce + 1 })),
      selectFlowItem: id =>
        set(id ? { selectedFlowId: id, selectedId: null } : { selectedFlowId: null }),
      setZoom: zoom =>
        set({ zoom: Math.min(3, Math.max(0.25, zoom)), zoomMode: 'manual' }),
      setFitZoom: zoom => {
        const next = Math.min(3, Math.max(0.25, zoom));
        if (Math.abs(next - get().zoom) < 0.005) return;
        set({ zoom: next });
      },
      setZoomMode: zoomMode => set({ zoomMode }),
      setScopeTab: tab => set({ scopeTab: tab, selectedId: null }),
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
          { selectedFlowId: item.id, selectedId: null }
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
        set({
          ...snapshot(state),
          selectedId: elementId,
          selectedFlowId: null,
          interaction: {
            target: 'element',
            kind,
            elementId,
            corner,
            startX: x,
            startY: y,
            original: { ...el.frame }
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
          const moved =
            interaction.kind === 'move'
              ? applyMove(interaction.original, dx, dy, pageW, pageH)
              : applyResize(interaction.original, interaction.corner!, dx, dy, pageH);
          if (!moved) return;

          // Snap against the other elements visible on this tab + region edges.
          const visible = scopesForTab(state.scopeTab);
          const targets = template.elements
            .filter(e => e.id !== interaction.elementId && visible.includes(e.scope))
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
          const rect = frameToRect(moved, pageH);
          const snapped =
            interaction.kind === 'move'
              ? snapMovingRect(rect, targets, pageW, pageH)
              : snapResizingRect(rect, interaction.corner!, targets, pageW, pageH);
          const frame = rectToFrame(snapped.rect, moved.anchor, pageH);

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
      endInteraction: () => set({ interaction: null, guides: null })
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
