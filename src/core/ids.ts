/** Id helpers shared by the editor and the starter-template builder. */

export function newElementId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `el-${uuid ?? Math.random().toString(36).slice(2, 10)}`;
}

export function newFlowId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `fl-${uuid ?? Math.random().toString(36).slice(2, 10)}`;
}
