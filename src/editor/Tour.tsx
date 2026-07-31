import { useEffect, useLayoutEffect, useState } from 'react';

/**
 * Tiny hand-rolled onboarding tour: dims the screen, highlights one area at a
 * time, and explains it in a bubble. No external dependencies.
 */
interface TourStep {
  selector: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    selector: '.pde-palette',
    title: 'Campos y elementos',
    body: 'Aquí están los datos del documento y los elementos (texto, imagen, línea). Arrástralos a la página o haz clic y luego clic en la página.'
  },
  {
    selector: '.pde-page',
    title: 'La página',
    body: 'Mueve y ajusta los elementos directamente sobre la página. Doble clic en un texto para escribir en él; las guías te ayudan a alinear.'
  },
  {
    selector: '.pde-flow-region',
    title: 'Área de contenido',
    body: 'El contenido dinámico (tablas, párrafos) vive aquí y crece con los datos; si no cabe, continúa en la siguiente página automáticamente.'
  },
  {
    selector: '.pde-tabs',
    title: 'Diseño por página',
    body: 'La primera página, las intermedias y la última pueden tener diseños distintos. Cambia de pestaña para editar cada una.'
  },
  {
    selector: '.pde-btn--preview',
    title: 'Vista previa',
    body: 'Genera el PDF real con datos de ejemplo en cualquier momento. Lo que ves ahí es exactamente lo que se descargará.'
  }
];

const BUBBLE_WIDTH = 300;
const GAP = 10;

export function Tour({ onClose }: { onClose(): void }) {
  // Resolve targets AFTER mount: during the first render the DOM still shows
  // the previous view, so filtering at render time matches the wrong elements.
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  useEffect(() => {
    const available = STEPS.filter(s => document.querySelector(s.selector));
    if (available.length === 0) onClose();
    else setSteps(available);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps?.[index];

  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = document.querySelector(step.selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [step]);

  if (!steps || !step || !rect) return null;

  const last = index === steps.length - 1;
  // Tall targets (full-height panels) get the bubble beside them; the rest
  // get it below, or above when there is no room underneath.
  const tall = rect.height > window.innerHeight * 0.5;
  const below = rect.bottom + 170 < window.innerHeight;
  let bubbleTop: number | undefined;
  let bubbleBottom: number | undefined;
  let bubbleLeft: number;
  if (tall) {
    bubbleTop = Math.max(8, rect.top + 16);
    bubbleLeft = Math.min(rect.right + GAP, window.innerWidth - BUBBLE_WIDTH - 8);
  } else {
    bubbleTop = below ? rect.bottom + GAP : undefined;
    bubbleBottom = below ? undefined : window.innerHeight - rect.top + GAP;
    bubbleLeft = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - BUBBLE_WIDTH - 8)
    );
  }

  return (
    <div className="pde-tour" role="dialog" aria-label="Tutorial">
      <div
        className="pde-tour__highlight"
        style={{
          left: rect.left - 4,
          top: rect.top - 4,
          width: rect.width + 8,
          height: rect.height + 8
        }}
      />
      <div
        className="pde-tour__bubble"
        style={{ left: bubbleLeft, top: bubbleTop, bottom: bubbleBottom, width: BUBBLE_WIDTH }}
      >
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="pde-tour__footer">
          <span className="pde-tour__dots">
            {steps.map((_, i) => (
              <i key={i} className={i === index ? 'pde-tour__dot--on' : ''} />
            ))}
          </span>
          <span className="pde-tour__actions">
            <button type="button" className="pde-btn" onClick={onClose}>
              Omitir
            </button>
            <button
              type="button"
              className="pde-btn pde-btn--primary"
              onClick={() => (last ? onClose() : setIndex(index + 1))}
            >
              {last ? '¡Listo!' : 'Siguiente'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

const TOUR_KEY = 'pde-editor-tour-v1';

export function shouldAutoStartTour(): boolean {
  try {
    return typeof localStorage !== 'undefined' && !localStorage.getItem(TOUR_KEY);
  } catch {
    return false;
  }
}

export function markTourDone(): void {
  try {
    localStorage.setItem(TOUR_KEY, new Date().toISOString());
  } catch {
    // storage unavailable — the tour will simply offer itself again
  }
}
