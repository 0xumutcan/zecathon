// A dungeon room: a painted background that fills the screen (bottom anchored, like the surface),
// with flickering torchlight and the points the story needs (quest board, chest spot).
import { loadImg, loadJSON } from "./assets.js";
import { stage, devPerArt } from "./stage.js";

// hand-placed points on room images (2752x1536 source px)
const ROOMS = {
  floor1: {
    torches: [{ x: 389, y: 739 }, { x: 2362, y: 744 }],
    lantern: { x: 1140, y: 870 },
    board: { x: 877, y: 921 },  // quest board center
    chestX: 2120,               // where the chest stands on the floor
  },
  floor2: {
    torches: [{ x: 383, y: 750 }, { x: 2377, y: 750 }],
    lantern: { x: 1146, y: 863 },
    board: { x: 876, y: 976 },
    chestX: 2150,               // right of the coin stacks
  },
};

export async function createRoom(name) {
  const [meta, img] = await Promise.all([loadJSON(`env/${name}.json`), loadImg(`env/${name}.webp`)]);
  const spot = ROOMS[name];
  let tf = { x: 0, y: 0, k: 1 };

  const room = {
    name, spot,
    floorY: 0, board: { x: 0, y: 0 }, chestX: 0,

    toArt(x, y) {
      const d = devPerArt();
      return { x: (tf.x + x * tf.k) / d, y: (tf.y + y * tf.k) / d };
    },

    draw(now) {
      const { bctx: c, bg } = stage, d = devPerArt();
      // cover the screen, keep the floor anchored and crop the ceiling first
      const k = Math.max(bg.width / meta.w, bg.height / meta.h);
      const w = meta.w * k, h = meta.h * k;
      tf = { x: (bg.width - w) / 2, y: bg.height - h, k };
      room.floorY = Math.round((tf.y + meta.groundY * k) / d);
      room.board = room.toArt(spot.board.x, spot.board.y);
      room.chestX = room.toArt(spot.chestX, 0).x;

      c.clearRect(0, 0, bg.width, bg.height);
      c.drawImage(img, tf.x, tf.y, w, h);
      // torchlight: two layered noises so the flicker never looks like a loop
      const t = now / 1000;
      c.globalCompositeOperation = "lighter";
      for (const [i, p] of [...spot.torches, spot.lantern].entries()) {
        const f = 0.75 + 0.15 * Math.sin(t * 9.1 + i * 2) + 0.1 * Math.sin(t * 23.7 + i * 5);
        const cx = tf.x + p.x * k, cy = tf.y + p.y * k, r = (p === spot.lantern ? 90 : 210) * k;
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255, 150, 60, ${0.22 * f})`);
        g.addColorStop(1, "rgba(255, 150, 60, 0)");
        c.fillStyle = g;
        c.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      c.globalCompositeOperation = "source-over";
    },
  };
  return room;
}
