import { parseTemplate, type Template } from '../core';

export interface TemplateSummary {
  id: string;
  name: string;
  docType: string;
  model?: string;
  updatedAt?: string;
}

/**
 * Host-provided persistence. The module never talks to a backend directly —
 * each app implements this against its own API/DB.
 */
export interface TemplateStorageAdapter {
  list(): Promise<TemplateSummary[]>;
  get(id: string): Promise<Template>;
  save(template: Template): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Browser localStorage adapter — demos, playgrounds and small tools. */
export function localStorageAdapter(key = 'pde-templates'): TemplateStorageAdapter {
  const read = (): Record<string, { template: unknown; updatedAt: string }> => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}');
    } catch {
      return {};
    }
  };
  const write = (data: Record<string, { template: unknown; updatedAt: string }>) =>
    localStorage.setItem(key, JSON.stringify(data));

  return {
    async list() {
      return Object.values(read())
        .map(({ template, updatedAt }) => {
          const t = template as Template;
          return {
            id: t.id,
            name: t.name,
            docType: t.docType,
            model: t.model,
            updatedAt
          };
        })
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    },
    async get(id) {
      const entry = read()[id];
      if (!entry) throw new Error(`Template '${id}' not found`);
      return parseTemplate(entry.template);
    },
    async save(template) {
      const data = read();
      data[template.id] = { template, updatedAt: new Date().toISOString() };
      write(data);
    },
    async remove(id) {
      const data = read();
      delete data[id];
      write(data);
    }
  };
}
