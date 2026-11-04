import '@fontsource/alexandria/300.css';
import '@fontsource/alexandria/400.css';
import '@fontsource/alexandria/600.css';
import '@fontsource/alexandria/700.css';
import '@fontsource/alexandria/800.css';
import '@fontsource/unbounded/500.css';
import '@fontsource/unbounded/600.css';
import './styles/main.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { contactHref } from './config';
import type { World } from './world/World';

gsap.registerPlugin(ScrollTrigger);

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll(s)) as T[];
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

let world: World | null = null;

/* ---------------- small UI bits ---------------- */
function setupStatic() {
  $$('[data-contact]').forEach((a) => {
    const href = contactHref();
    a.setAttribute('href', href);
    if (href.startsWith('http')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    }
  });
  $('#year').textContent = String(new Date().getFullYear());
  $$('[data-intro]').forEach((el, i) => el.style.setProperty('--d', String(i)));

  // manifesto: one span per word (Arabic words stay joined)
  const m = $('[data-words]');
  const words = m.textContent!.trim().split(/\s+/);
  m.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');

  if (finePointer && !reduced) {
    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = (e as PointerEvent).clientX - (r.left + r.width / 2);
        const dy = (e as PointerEvent).clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.22}px, ${dy * 0.32}px)`;
      });
      el.addEventListener('pointerleave', () => (el.style.transform = ''));
    });
  }
}

function setupNav(lenis: Lenis | null) {
  const nav = $('#nav');
  let last = 0;
  const onScroll = (y: number) => {
    nav.classList.toggle('is-scrolled', y > 40);
    const down = y > last + 2;
    const up = y < last - 2;
    if (down && y > 300) nav.classList.add('is-hidden');
    if (up) nav.classList.remove('is-hidden');
    last = y;
  };
  if (lenis) lenis.on('scroll', ({ scroll }: { scroll: number }) => onScroll(scroll));
  else addEventListener('scroll', () => onScroll(scrollY), { passive: true });

  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')!;
      const el = id === '#top' ? document.body : $(id);
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el as HTMLElement, { offset: 0, duration: 1.6 });
      else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }),
  );
}

/* ---------------- preloader ---------------- */
const loader = {
  shown: 0,
  target: 0,
  set(v: number, note?: string) {
    this.target = Math.max(this.target, v);
    if (note) $('#loadNote').textContent = note;
  },
  tick() {
    this.shown += (this.target - this.shown) * 0.12;
    $('#loadPct').textContent = String(Math.round(this.shown));
  },
};

/* ---------------- scenes ---------------- */
type SceneName = 'hero' | 'ribbon' | 'services' | 'lab' | 'layers' | 'calm' | 'word';
const SCENES: Record<SceneName, { shape: number; prism: number; beams: number; glow: number; opacity: number; flow: number; layers: number; aurora: number }> = {
  hero: { shape: 0, prism: 1, beams: 1, glow: 1, opacity: 1, flow: 0.35, layers: 0, aurora: 1 },
  ribbon: { shape: 1, prism: 0, beams: 0, glow: 1.15, opacity: 1, flow: 0.1, layers: 0, aurora: 1 },
  services: { shape: 2, prism: 0, beams: 0, glow: 1.15, opacity: 1, flow: 0.06, layers: 0, aurora: 0.8 },
  lab: { shape: 0, prism: 0, beams: 0, glow: 0.5, opacity: 0.55, flow: 0.3, layers: 0, aurora: 0.6 },
  layers: { shape: 0, prism: 0, beams: 0, glow: 0.35, opacity: 0.3, flow: 0.3, layers: 0, aurora: 0.8 },
  calm: { shape: 0, prism: 0, beams: 0, glow: 0.6, opacity: 0.7, flow: 0.3, layers: 0, aurora: 0.7 },
  word: { shape: 5, prism: 0, beams: 0, glow: 1.3, opacity: 1, flow: 0.05, layers: 0, aurora: 1 },
};
let currentScene: SceneName = 'hero';
let currentShape = 0;
let serviceIdx = 0;
let shapeTween: gsap.core.Tween | null = null;

function toShape(k: number, flow: number) {
  if (!world || k === currentShape) return;
  currentShape = k;
  const w = world.state.weights;
  const from = w.slice();
  const p = { t: 0 };
  shapeTween?.kill();
  const dur = reduced ? 0.01 : 1.6;
  shapeTween = gsap.to(p, {
    t: 1,
    duration: dur,
    ease: 'power2.inOut',
    onUpdate: () => {
      for (let i = 0; i < w.length; i++) w[i] = from[i] + ((i === k ? 1 : 0) - from[i]) * p.t;
    },
  });
  // a swirl while the particles travel, settling into the new shape
  if (!reduced) gsap.fromTo(world.state, { flow: 0.9 }, { flow, duration: dur * 1.15, ease: 'power2.out', overwrite: 'auto' });
  else world.state.flow = flow;
}

function setScene(name: SceneName) {
  if (!world) return;
  currentScene = name;
  (window as any).__scene = name;
  const s = SCENES[name];
  Object.assign(world.state, { prism: s.prism, beams: s.beams, glow: s.glow, opacity: s.opacity, aurora: s.aurora });
  const shape = name === 'services' ? 2 + serviceIdx : s.shape;
  if (shape === currentShape) gsap.to(world.state, { flow: s.flow, duration: 1 });
  toShape(shape, s.flow);
}

function setupScroll() {
  // scene switching: whichever section crosses the middle of the screen
  $$('[data-scene]').forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => self.isActive && setScene(sec.dataset.scene as SceneName),
    });
  });

  // hero: the prism drifts up as you leave
  ScrollTrigger.create({
    trigger: '.hero',
    start: 'top top',
    end: 'bottom top',
    onUpdate: (self) => world && (world.state.prismLift = self.progress * 0.55),
  });

  // manifesto words light up with scroll
  const words = $$('.manifesto .w');
  ScrollTrigger.create({
    trigger: '.manifesto',
    start: 'top 75%',
    end: 'center 40%',
    onUpdate: (self) => {
      const n = Math.round(self.progress * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < n));
    },
  });

  // contact: the particle word sits in the space reserved above the title and scrolls with it
  const wordBox = $('.contact__word');
  const placeWord = () => world && world.anchorShape(5, wordBox.getBoundingClientRect(), { w: 6.6, h: 3.3 }, 0.95);
  ScrollTrigger.create({ trigger: '.contact', start: 'top bottom', end: 'bottom top', onUpdate: placeWord, onRefresh: placeWord });

  // services shapes live in the empty stage next to (or above) the text panels
  const svcStage = $('.services__stage');
  const placeServices = () => {
    if (!world) return;
    const r = svcStage.getBoundingClientRect();
    for (const k of [2, 3, 4]) world.anchorShape(k, r, { w: 6.2, h: 5.4 }, 0.94);
  };
  ScrollTrigger.create({ trigger: '.services', start: 'top bottom', end: 'bottom top', onUpdate: placeServices, onRefresh: placeServices });

  // the exploded layers live in their own empty column (or row on phones)
  const layersSpace = $('.layers__space');
  const placeLayers = () => world && world.anchorLayers(layersSpace.getBoundingClientRect(), 0.92);
  ScrollTrigger.create({ trigger: '.layers', start: 'top bottom', end: 'bottom top', onUpdate: placeLayers, onRefresh: placeLayers });

  addEventListener('resize', () => {
    placeWord();
    placeServices();
    placeLayers();
  });

  // services: three steps inside one sticky section
  const panels = $$('.svc');
  const steps = $$('.services__steps li');
  ScrollTrigger.create({
    trigger: '.services',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      const idx = Math.min(2, Math.floor(self.progress * 3));
      if (idx === serviceIdx) return;
      serviceIdx = idx;
      panels.forEach((p, i) => p.classList.toggle('is-active', i === idx));
      steps.forEach((p, i) => p.classList.toggle('is-active', i === idx));
      if (currentScene === 'services') toShape(2 + idx, SCENES.services.flow);
    },
  });

  // layers: scrubbed explode + active label; the 3D only shows while the section is pinned
  const items = $$('.layers__list li');
  const layersEl = $('.layers');
  ScrollTrigger.create({
    trigger: layersEl,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: () => {
      if (!world) return;
      const r = layersEl.getBoundingClientRect();
      const vh = innerHeight;
      const enter = Math.min(1, Math.max(0, 1 - r.top / (vh * 0.3)));
      const leave = Math.min(1, Math.max(0, (r.bottom - vh * 0.25) / (vh * 0.4)));
      world.state.layers = enter * leave;
      world.state.layersProgress = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
      const a = world.layers.active;
      items.forEach((li, i) => li.classList.toggle('is-active', a === -1 || a === i));
    },
    onLeave: () => world && (world.state.layers = 0),
    onLeaveBack: () => world && (world.state.layers = 0),
  });
}

/* ---------------- HUD + live status ---------------- */
function setupHud(w: World) {
  const hud = $('#hud');
  const t = $('#hudText');
  const lb = $('#liveBackend');
  const lc = $('#liveCount');
  const lf = $('#liveFps');
  lb.textContent = w.info.backend;
  lc.textContent = w.info.count.toLocaleString('en-US');
  let acc = 0;
  let lastT = performance.now();
  w.onFrame = (fps) => {
    const now = performance.now();
    acc += now - lastT;
    lastT = now;
    if (acc < 500) return;
    acc = 0;
    const f = Math.min(240, Math.round(fps));
    t.textContent = `${w.info.backend} · ${w.info.count.toLocaleString('en-US')} particles · ${f} fps`;
    lf.textContent = String(f);
  };
  hud.classList.add('is-on');
}

/* ---------------- lab ---------------- */
function setupLab() {
  const stage = $('#labStage');
  const canvas = $<HTMLCanvasElement>('#labCanvas');
  let lab: import('./lab/Configurator').Configurator | null = null;
  const pending: Array<(l: NonNullable<typeof lab>) => void> = [];
  const use = (fn: (l: NonNullable<typeof lab>) => void) => (lab ? fn(lab) : pending.push(fn));

  $$<HTMLButtonElement>('#swatches .sw').forEach((b, _, all) =>
    b.addEventListener('click', () => {
      all.forEach((x) => {
        x.classList.toggle('is-on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      $('#liquidName').textContent = b.dataset.name!;
      use((l) => l.setLiquid(b.dataset.liquid!));
    }),
  );
  $$<HTMLButtonElement>('#finishes button').forEach((b, _, all) =>
    b.addEventListener('click', () => {
      all.forEach((x) => {
        x.classList.toggle('is-on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      use((l) => l.setFinish(b.dataset.finish as any));
    }),
  );
  const fill = $<HTMLInputElement>('#fill');
  fill.addEventListener('input', () => {
    $('#fillVal').textContent = fill.value + '%';
    use((l) => l.setFill(+fill.value / 100));
  });

  if (root.classList.contains('no-3d')) {
    stage.classList.add('is-static');
    return;
  }
  const io = new IntersectionObserver(
    async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      try {
        const { Configurator } = await import('./lab/Configurator');
        const c = new Configurator(stage, canvas);
        await c.init();
        c.snap();
        lab = c;
        pending.splice(0).forEach((fn) => fn(c));
        (window as any).__tayf = Object.assign((window as any).__tayf || {}, { lab: c });
      } catch (err) {
        console.warn('lab fallback', err);
        stage.classList.add('is-static');
      }
    },
    { rootMargin: '900px 0px' },
  );
  io.observe(stage);
}

/* ---------------- boot ---------------- */
async function boot() {
  setupStatic();
  const timer = setInterval(() => loader.tick(), 30);
  loader.set(12, 'عم نحمّل الخطوط…');

  let lenis: Lenis | null = null;
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, touchMultiplier: 1.2 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis!.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  setupNav(lenis);

  await Promise.all([
    document.fonts.load('800 100px Alexandria'),
    document.fonts.load('400 40px Alexandria'),
    document.fonts.load('600 60px Unbounded'),
  ]).catch(() => {});
  loader.set(35, 'عم نشغّل كرت الشاشة…');

  const started = performance.now();
  try {
    const { World } = await import('./world/World');
    loader.set(55, 'عم نبني 65 ألف جزيء…');
    const w = new World();
    const params = new URLSearchParams(location.search);
    await w.init($<HTMLCanvasElement>('#world'), { forceWebGL: params.has('webgl'), count: params.has('count') ? +params.get('count')! : undefined });
    w.layers.build();
    world = w;
    (window as any).__tayf = Object.assign((window as any).__tayf || {}, { renderer: w.renderer, world: w });
    loader.set(92, 'آخر لمسة…');
    setupHud(w);
  } catch (err) {
    console.warn('3D unavailable, static fallback', err);
    root.classList.add('no-3d');
  }

  setupLab();
  setupScroll();

  const wait = Math.max(0, 1100 - (performance.now() - started));
  await new Promise((r) => setTimeout(r, wait));
  loader.set(100);
  await new Promise((r) => setTimeout(r, 380));
  clearInterval(timer);
  $('#loadPct').textContent = '100';

  world?.start();
  root.classList.remove('is-loading');
  lenis?.start();
  ScrollTrigger.refresh();
  (window as any).__ready = true;
}

boot();
