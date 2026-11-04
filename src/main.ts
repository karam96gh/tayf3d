import '@fontsource/alexandria/300.css';
import '@fontsource/alexandria/500.css';
import '@fontsource/alexandria/700.css';
import '@fontsource/alexandria/800.css';
import './styles.css';
import { contactHref } from './config';
import { Prism, type PrismTarget } from './prism/Prism';

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string) => Array.from(document.querySelectorAll(s)) as T[];
const root = document.documentElement;
const narrow = matchMedia('(max-width: 900px)');

/* ---------- where the glass goes in each part of the page ---------- */
type Scene = 'hero' | 'statement' | 'services' | 'process' | 'contact';
const WIDE: Record<Scene, PrismTarget> = {
  hero: { x: -0.47, y: 0.0, zoom: 0.86, spread: 0, twist: 1, fade: 1, floor: 1, pitch: 0.5 },
  statement: { x: -0.5, y: 0.02, zoom: 0.74, spread: 0.34, twist: 1.7, fade: 1, floor: 0.55, pitch: 0.62 },
  services: { x: -0.5, y: -0.02, zoom: 0.66, spread: 1, twist: 2.3, fade: 1, floor: 0, pitch: 0.4 },
  process: { x: -0.62, y: 0.55, zoom: 0.42, spread: 0.5, twist: 3, fade: 0, floor: 0, pitch: 0.7 },
  contact: { x: 0, y: 0.34, zoom: 0.66, spread: 0, twist: 1, fade: 1, floor: 0, pitch: 0.55 },
};
// on phones the glass stays above the words, and steps aside while you read
const NARROW: Record<Scene, PrismTarget> = {
  hero: { x: 0, y: 0.43, zoom: 0.6, spread: 0, twist: 1, fade: 1, floor: 1, pitch: 0.55 },
  statement: { x: 0, y: 0.62, zoom: 0.4, spread: 0.4, twist: 1.8, fade: 0, floor: 0, pitch: 0.6 },
  services: { x: 0, y: 0.62, zoom: 0.4, spread: 1, twist: 2.3, fade: 0, floor: 0, pitch: 0.45 },
  process: { x: 0, y: 0.62, zoom: 0.4, spread: 0.5, twist: 3, fade: 0, floor: 0, pitch: 0.6 },
  contact: { x: 0, y: 0.42, zoom: 0.52, spread: 0, twist: 1, fade: 1, floor: 0, pitch: 0.55 },
};

let prism: Prism | null = null;
let scene: Scene = 'hero';
const apply = () => {
  if (!prism) return;
  Object.assign(prism.target, (narrow.matches ? NARROW : WIDE)[scene]);
  if (scene === 'contact') placeInSpace();
};

// at the end of the page the glass sits in the space kept for it above the headline, and scrolls with it
let space: HTMLElement;
function placeInSpace() {
  if (!prism || scene !== 'contact') return;
  const r = space.getBoundingClientRect();
  prism.target.x = ((r.left + r.width / 2) / innerWidth) * 2 - 1;
  prism.target.y = -(((r.top + r.height / 2) / innerHeight) * 2 - 1);
  prism.target.zoom = Math.min(0.78, Math.max(0.3, (r.height / innerHeight / 0.6) * 0.92));
}

function boot() {
  // contact links (WhatsApp when a number is set in config.ts)
  const href = contactHref();
  $$('[data-contact]').forEach((a) => {
    a.setAttribute('href', href);
    if (href.startsWith('http')) a.setAttribute('target', '_blank');
  });
  $('#year').textContent = String(new Date().getFullYear());

  // the glass
  const canvas = $<HTMLCanvasElement>('#prism');
  try {
    const p = new Prism(canvas);
    if (p.init()) {
      prism = p;
      p.onFirstFrame = () => canvas.classList.add('is-ready');
      p.dragOn($('.hero'));
      p.dragOn($('.contact'));
      apply();
      p.start();
    } else root.classList.add('no-3d');
  } catch (err) {
    console.warn('glass fallback', err);
    root.classList.add('no-3d');
  }
  narrow.addEventListener('change', apply);

  // the section crossing the middle of the screen decides the scene
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        scene = (e.target as HTMLElement).dataset.scene as Scene;
        apply();
      }
    },
    { rootMargin: '-48% 0px -48% 0px' },
  );
  $$('[data-scene]').forEach((s) => io.observe(s));

  // service rows light up their own plate
  const rows = $$('.row');
  rows.forEach((r) => {
    r.addEventListener('pointerenter', () => prism && (prism.focus = +r.dataset.plate!));
    r.addEventListener('pointerleave', () => prism && (prism.focus = -1));
  });
  const rowIo = new IntersectionObserver(
    (entries) => {
      if (matchMedia('(hover: hover)').matches) return;
      for (const e of entries) e.target.classList.toggle('is-on', e.isIntersecting);
    },
    { rootMargin: '-40% 0px -40% 0px' },
  );
  rows.forEach((r) => rowIo.observe(r));

  // nav gets a glass background once you scroll
  const nav = $('#nav');
  space = $('.contact__space');
  let ticking = false;
  const onScroll = () => {
    nav.classList.toggle('is-solid', scrollY > 30);
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      placeInSpace();
    });
  };
  addEventListener('resize', placeInSpace);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  (window as any).__tayf = { prism };
}

boot();
