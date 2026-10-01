// The shielded layer between the surface and the dungeon: a golden plexus tunnel he falls through.
// Rings of nodes rush outward from the center as the camera sinks, so scrolling drives the flight
// (and scrolling back flies it in reverse). Drawn on the bg canvas, only inside the band of earth.
import { stage, devPerArt } from "./stage.js";

const RINGS = 36;     // rings in the tunnel loop
const PER_RING = 22;  // nodes per ring
const LOOP = RINGS;   // tunnel length in depth units (one ring per unit)
const NEAR = 0.35, FAR = LOOP;

export function createTunnel() {
  // a fixed random tunnel, so it looks the same every time you fly through
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rings = Array.from({ length: RINGS }, (_, i) => {
    const twist = i * 0.21;
    return Array.from({ length: PER_RING }, (_, j) => ({
      a: twist + (j / PER_RING) * Math.PI * 2 + (rnd() - 0.5) * 0.25,
      r: 0.85 + rnd() * 0.3,
      bright: rnd() < 0.2,
      link: rnd() < 0.55,   // connects to the same node on the next ring
      streak: rnd() < 0.18, // leaves a speed line when it passes close
    }));
  });

  return {
    /**
     * @param depth   how far along the tunnel we are (art units of camera travel)
     * @param band    { top, bottom } screen rows (art units) where the earth is visible
     * @param center  { x, y } art point the tunnel converges on (him)
     */
    draw(now, depth, band, center) {
      const { bctx: c, bg } = stage, d = devPerArt();
      const top = Math.max(0, band.top * d), bottom = Math.min(bg.height, band.bottom * d);
      if (bottom - top < 2) return;
      const cx = center.x * d, cy = center.y * d;
      const R = Math.max(bg.width, bg.height) * 0.22;
      const z = depth / 45 + now / 9000; // scroll drives it; a slow drift keeps it alive when you stop

      c.save();
      c.beginPath();
      c.rect(0, top, bg.width, bottom - top);
      c.clip();

      const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(bg.width, bg.height) * 0.7);
      g.addColorStop(0, "#1c1309");
      g.addColorStop(1, "#060403");
      c.fillStyle = g;
      c.fillRect(0, top, bg.width, bottom - top);

      c.globalCompositeOperation = "lighter";
      // the warm core the rings pour out of
      const core = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.9);
      core.addColorStop(0, "rgba(255, 170, 60, 0.35)");
      core.addColorStop(0.35, "rgba(244, 140, 30, 0.12)");
      core.addColorStop(1, "rgba(244, 140, 30, 0)");
      c.fillStyle = core;
      c.fillRect(cx - R, cy - R, R * 2, R * 2);
      const proj = (ring, node, dz) => {
        const s = R / dz;
        return { x: cx + Math.cos(node.a) * node.r * s, y: cy + Math.sin(node.a) * node.r * s, s };
      };
      // fade in from the far end, fade out right before a ring flies past
      const fade = (dz) => Math.min(1, (FAR - dz) / 8) * Math.min(1, (dz - NEAR) / 0.6);

      for (let i = 0; i < RINGS; i++) {
        const dz = ((i - z) % LOOP + LOOP) % LOOP;
        if (dz < NEAR) continue;
        const a = fade(dz);
        if (a <= 0) continue;
        const ring = rings[i], next = rings[(i + 1) % RINGS];
        const dzNext = dz + 1;
        const pts = ring.map((n) => proj(ring, n, dz));

        c.lineWidth = Math.max(1, 2.6 / dz) * stage.DPR;
        // the ring itself
        c.strokeStyle = `rgba(244, 170, 50, ${0.5 * a})`;
        c.beginPath();
        pts.forEach((p, j) => (j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.stroke();
        // plexus links to the next ring
        if (dzNext < FAR) {
          c.strokeStyle = `rgba(244, 160, 40, ${0.32 * a})`;
          c.beginPath();
          ring.forEach((n, j) => {
            if (!n.link) return;
            const q = proj(next, next[j], dzNext);
            c.moveTo(pts[j].x, pts[j].y);
            c.lineTo(q.x, q.y);
          });
          c.stroke();
        }
        // nodes, and speed lines toward the center for the close ones
        pts.forEach((p, j) => {
          const n = ring[j];
          const size = Math.max(1.5, (n.bright ? 8 : 4) / dz) * stage.DPR;
          if (n.streak && dz < 4) {
            const back = proj(ring, n, dz + 1.6);
            c.strokeStyle = `rgba(255, 210, 120, ${0.5 * a})`;
            c.lineWidth = size * 0.6;
            c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(back.x, back.y); c.stroke();
          }
          c.fillStyle = n.bright ? `rgba(255, 236, 190, ${0.95 * a})` : `rgba(244, 183, 40, ${0.75 * a})`;
          c.fillRect(p.x - size / 2, p.y - size / 2, size, size); // square nodes keep it pixel-ish
          if (n.bright) {
            const halo = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 4);
            halo.addColorStop(0, `rgba(255, 200, 90, ${0.55 * a})`);
            halo.addColorStop(1, "rgba(255, 200, 90, 0)");
            c.fillStyle = halo;
            c.fillRect(p.x - size * 4, p.y - size * 4, size * 8, size * 8);
          }
        });
      }

      // soften the band's edges into the soil above and the room below
      c.globalCompositeOperation = "source-over";
      const edge = stage.H * 0.18 * d;
      for (const [y0, y1] of [[top, top + edge], [bottom, bottom - edge]]) {
        const e = c.createLinearGradient(0, y0, 0, y1);
        e.addColorStop(0, "rgba(27, 22, 20, 1)");
        e.addColorStop(1, "rgba(27, 22, 20, 0)");
        c.fillStyle = e;
        c.fillRect(0, Math.min(y0, y1), bg.width, Math.abs(y1 - y0));
      }
      c.restore();
    },
  };
}
