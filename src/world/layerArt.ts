/** Draws the four layers of a mock website onto canvases (used as textures in the exploded showcase). */
export const LW = 1600;
export const LH = 1000;
const AR = 'Alexandria, sans-serif';

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function make() {
  const c = document.createElement('canvas');
  c.width = LW;
  c.height = LH;
  const g = c.getContext('2d')!;
  return { c, g };
}

function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, color + Math.round(a * 255).toString(16).padStart(2, '0'));
  grd.addColorStop(1, color + '00');
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

export function drawBackground() {
  const { c, g } = make();
  rr(g, 0, 0, LW, LH, 40);
  g.save();
  g.clip();
  const lin = g.createLinearGradient(0, 0, LW, LH);
  lin.addColorStop(0, '#120D2E');
  lin.addColorStop(1, '#07060F');
  g.fillStyle = lin;
  g.fillRect(0, 0, LW, LH);
  blob(g, 1250, 380, 520, '#8C86FF', 0.55);
  blob(g, 330, 760, 460, '#FF8CC6', 0.35);
  blob(g, 820, 120, 380, '#8FF7FF', 0.22);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 2;
  for (let x = 0; x < LW; x += 80) {
    g.beginPath();
    g.moveTo(x, 70);
    g.lineTo(x, LH);
    g.stroke();
  }
  for (let y = 70; y < LH; y += 80) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(LW, y);
    g.stroke();
  }
  // browser bar
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(0, 0, LW, 70);
  ['#FF6B8B', '#FFC56B', '#6BFFB0'].forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(46 + i * 34, 35, 11, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = 'rgba(255,255,255,0.08)';
  rr(g, 560, 17, 480, 36, 18);
  g.fill();
  g.fillStyle = 'rgba(244,242,255,0.65)';
  g.font = `400 22px ${AR}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('yourbrand.com', 800, 36);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 3;
  rr(g, 1.5, 1.5, LW - 3, LH - 3, 40);
  g.stroke();
  return c;
}

export function drawContent() {
  const { c, g } = make();
  g.direction = 'rtl';
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  // nav
  g.fillStyle = '#F4F2FF';
  g.font = `800 34px ${AR}`;
  g.fillText('مشروعك', 1520, 135);
  g.fillStyle = 'rgba(244,242,255,0.6)';
  g.font = `400 24px ${AR}`;
  ['الرئيسية', 'خدماتنا', 'أعمالنا', 'تواصل'].forEach((t, i) => g.fillText(t, 1260 - i * 150, 132));
  // headline
  g.fillStyle = '#F4F2FF';
  g.font = `800 104px ${AR}`;
  g.fillText('هون بتبلّش', 1520, 345);
  const grd = g.createLinearGradient(1000, 0, 1520, 0);
  grd.addColorStop(0, '#8FF7FF');
  grd.addColorStop(0.5, '#C98BFF');
  grd.addColorStop(1, '#FF8CC6');
  g.fillStyle = grd;
  g.fillText('قصّتك.', 1520, 470);
  // paragraph bars
  g.fillStyle = 'rgba(244,242,255,0.22)';
  [620, 560, 600].forEach((w, i) => {
    rr(g, 1520 - w, 520 + i * 38, w, 16, 8);
    g.fill();
  });
  // cards on the left
  for (let i = 0; i < 3; i++) {
    const x = 90 + i * 230;
    const y = 300 + (i % 2) * 60;
    g.fillStyle = 'rgba(255,255,255,0.07)';
    rr(g, x, y, 200, 280, 26);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = ['rgba(255,140,198,0.5)', 'rgba(140,134,255,0.5)', 'rgba(143,247,255,0.45)'][i];
    rr(g, x + 22, y + 22, 156, 120, 16);
    g.fill();
    g.fillStyle = 'rgba(244,242,255,0.35)';
    rr(g, x + 22, y + 170, 130, 14, 7);
    g.fill();
    rr(g, x + 22, y + 200, 96, 14, 7);
    g.fill();
  }
  // section footer bars
  g.fillStyle = 'rgba(244,242,255,0.12)';
  rr(g, 90, 820, 1430, 110, 26);
  g.fill();
  return c;
}

function isoCube(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, cols: [string, string, string]) {
  const h = s * 0.5;
  g.fillStyle = cols[0];
  g.beginPath();
  g.moveTo(cx, cy - s);
  g.lineTo(cx + s * 0.87, cy - h);
  g.lineTo(cx, cy);
  g.lineTo(cx - s * 0.87, cy - h);
  g.closePath();
  g.fill();
  g.fillStyle = cols[1];
  g.beginPath();
  g.moveTo(cx - s * 0.87, cy - h);
  g.lineTo(cx, cy);
  g.lineTo(cx, cy + s);
  g.lineTo(cx - s * 0.87, cy + h);
  g.closePath();
  g.fill();
  g.fillStyle = cols[2];
  g.beginPath();
  g.moveTo(cx + s * 0.87, cy - h);
  g.lineTo(cx, cy);
  g.lineTo(cx, cy + s);
  g.lineTo(cx + s * 0.87, cy + h);
  g.closePath();
  g.fill();
}

export function drawMotion() {
  const { c, g } = make();
  // trails
  g.setLineDash([14, 16]);
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(143,247,255,0.55)';
  g.beginPath();
  g.arc(520, 520, 300, Math.PI * 1.1, Math.PI * 1.85);
  g.stroke();
  g.strokeStyle = 'rgba(255,140,198,0.5)';
  g.beginPath();
  g.arc(1180, 700, 250, Math.PI * 0.1, Math.PI * 0.7);
  g.stroke();
  g.setLineDash([]);
  isoCube(g, 560, 520, 120, ['#C3B2FF', '#6B5BFF', '#2C1F9E']);
  isoCube(g, 300, 260, 54, ['#BFFBFF', '#4DC9E6', '#1D7FA3']);
  // spheres
  const sph = (x: number, y: number, r: number, a: string, b: string) => {
    const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    grd.addColorStop(0, a);
    grd.addColorStop(1, b);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  sph(1240, 230, 70, '#FFD1E8', '#E0479A');
  sph(980, 820, 40, '#D9FDFF', '#2FC6E0');
  sph(140, 700, 30, '#E8DDFF', '#8E44E8');
  // ring
  g.lineWidth = 16;
  g.strokeStyle = 'rgba(201,139,255,0.85)';
  g.beginPath();
  g.ellipse(820, 300, 110, 46, -0.35, 0, Math.PI * 2);
  g.stroke();
  // speed lines
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(244,242,255,0.35)';
  g.lineWidth = 5;
  [[1330, 230, 1440], [1320, 260, 1410], [1340, 200, 1400]].forEach(([x1, y, x2]) => {
    g.beginPath();
    g.moveTo(x1, y);
    g.lineTo(x2, y);
    g.stroke();
  });
  return c;
}

export function drawInteraction() {
  const { c, g } = make();
  g.direction = 'rtl';
  // primary button with glow
  g.shadowColor = 'rgba(140,134,255,0.9)';
  g.shadowBlur = 60;
  const grd = g.createLinearGradient(1180, 0, 1520, 0);
  grd.addColorStop(0, '#8C86FF');
  grd.addColorStop(1, '#C98BFF');
  g.fillStyle = grd;
  rr(g, 1180, 660, 340, 92, 46);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#0B0820';
  g.font = `700 34px ${AR}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('احجز موعدك', 1350, 708);
  // secondary button
  g.strokeStyle = 'rgba(244,242,255,0.6)';
  g.lineWidth = 3;
  rr(g, 920, 660, 230, 92, 46);
  g.stroke();
  g.fillStyle = '#F4F2FF';
  g.font = `600 30px ${AR}`;
  g.fillText('أعمالنا', 1035, 708);
  // ripples
  [60, 100, 140].forEach((r, i) => {
    g.strokeStyle = `rgba(143,247,255,${0.7 - i * 0.2})`;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(1290, 730, r, 0, Math.PI * 2);
    g.stroke();
  });
  // cursor
  g.save();
  g.translate(1290, 728);
  g.scale(3.2, 3.2);
  g.fillStyle = '#FFFFFF';
  g.strokeStyle = '#06050B';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, 22);
  g.lineTo(6, 16.5);
  g.lineTo(10, 25.5);
  g.lineTo(13.5, 24);
  g.lineTo(9.6, 15.2);
  g.lineTo(17.5, 15.2);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  // toggle + tooltip on the left
  g.fillStyle = 'rgba(143,247,255,0.9)';
  rr(g, 120, 160, 130, 64, 32);
  g.fill();
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.arc(218, 192, 24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(14,12,24,0.92)';
  rr(g, 300, 150, 260, 84, 20);
  g.fill();
  g.strokeStyle = 'rgba(201,139,255,0.8)';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = '#F4F2FF';
  g.font = `600 28px ${AR}`;
  g.textAlign = 'center';
  g.fillText('تمّ الحجز ✓', 430, 192);
  return c;
}
