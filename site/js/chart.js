// Профиль высот (SVG) с подсказкой при наведении
export function renderProfile(box, prof, { onHover, note } = {}) {
  if (!prof || prof.length < 2) { box.innerHTML = ''; return; }
  const W = 800, Hh = 170, pl = 44, pr = 10, pt = 14, pb = 24;
  const maxX = prof[prof.length - 1][0]; let mn = Math.min(...prof.map((p) => p[1])), mx = Math.max(...prof.map((p) => p[1]));
  if (mx - mn < 50) { mx += 25; mn -= 25; }
  const x = (v) => pl + (v / maxX) * (W - pl - pr), y = (v) => pt + (1 - (v - mn) / (mx - mn)) * (Hh - pt - pb);
  const d = prof.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const ticks = [mn, (mn + mx) / 2, mx].map((v) => `<text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text><line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e8e4"/>`).join('');
  const kms = [0, 0.25, 0.5, 0.75, 1].map((f) => `<text x="${x(maxX * f)}" y="${Hh - 6}" text-anchor="middle">${fmt(maxX * f)}</text>`).join('');
  box.innerHTML = `<div class="ptip" aria-live="polite"></div><svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" aria-label="Профиль высот">
  <defs><linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0e8c72" stop-opacity=".45"/><stop offset="1" stop-color="#0e8c72" stop-opacity=".05"/></linearGradient></defs>
  <g font-size="12" fill="#7b8a85" font-family="Manrope,sans-serif">${ticks}${kms}</g>
  <path d="${d}L${x(maxX)},${Hh - pb}L${pl},${Hh - pb}Z" fill="url(#pg)"/><path d="${d}" fill="none" stroke="#0b6e5a" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
  <line class="cur" y1="${pt}" y2="${Hh - pb}" stroke="#f28c28" stroke-width="2" visibility="hidden" vector-effect="non-scaling-stroke"/></svg>${note ? `<p class="hint">${note}</p>` : ''}`;
  const svg = box.querySelector('svg'), cur = svg.querySelector('.cur'), tip = box.querySelector('.ptip');
  const move = (ev) => {
    const r = svg.getBoundingClientRect(); const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
    const km = Math.max(0, Math.min(maxX, ((cx - pl) / (W - pl - pr)) * maxX));
    let i = prof.findIndex((p) => p[0] >= km); if (i < 0) i = prof.length - 1;
    cur.setAttribute('x1', x(prof[i][0])); cur.setAttribute('x2', x(prof[i][0])); cur.setAttribute('visibility', 'visible');
    tip.textContent = `${fmt(prof[i][0])} км · ${prof[i][1]} м`; onHover && onHover(prof[i][0]);
  };
  svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true });
  svg.addEventListener('mouseleave', () => { cur.setAttribute('visibility', 'hidden'); tip.textContent = ''; onHover && onHover(null); });
}
const fmt = (v) => (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1)).toString().replace('.', ',');
