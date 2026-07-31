/** Module UI strings — Spanish by default, overridable via the strings prop. */
export const DEFAULT_STRINGS = {
  templates: 'Plantillas',
  newTemplate: 'Nueva plantilla',
  name: 'Nombre',
  type: 'Tipo de documento',
  model: 'Modelo',
  updated: 'Actualizada',
  actions: 'Acciones',
  edit: 'Editar',
  duplicate: 'Duplicar',
  copySuffix: '(copia)',
  delete: 'Eliminar',
  confirmDelete: '¿Eliminar esta plantilla?',
  confirmDiscard: 'Tienes cambios sin guardar. ¿Salir sin guardarlos?',
  empty: 'Aún no hay plantillas. Crea la primera.',
  loading: 'Cargando…',
  // wizard
  wizardTitle: 'Nueva plantilla',
  namePlaceholder: 'p. ej. Cotización con membrete',
  nameRequired: 'Escribe un nombre para identificar la plantilla.',
  carta: 'Carta (612×792)',
  oficio: 'Oficio (612×936)',
  custom: 'Personalizado',
  widthPt: 'Ancho (pt)',
  heightPt: 'Alto (pt)',
  noModel: '(sin modelo)',
  background: 'PDF de fondo (opcional)',
  backgroundHint:
    'Un PDF ya diseñado (membrete, colores institucionales) sobre el que se colocan los campos.',
  create: 'Crear y diseñar',
  cancel: 'Cancelar',
  // editor shell
  back: '← Plantillas',
  save: 'Guardar',
  saved: 'Guardado',
  fixErrors: 'Corrige los errores antes de guardar'
};

export type ModuleStrings = typeof DEFAULT_STRINGS;
