// A dungeon room stacked below the surface in one tall world. World y (art units) equals screen y when the
// camera is at 0: the surface image ends at the bottom of the first screen, then comes EARTH of soil
// (with the shaft), then each room, one under the other.
import { loadImg, loadJSON } from "./assets.js";
import { stage, devPerArt } from "./stage.js";

export const EARTH = () => stage.H * 1.4; // soil between the surface and the first room

// hand-placed points on room images (2752x1536 source px)
const ROOMS = {
  floor1: {
    torches: [{ x: 389, y: 739 }, { x: 2362, y: 744 }],
    lantern: { x: 1140, y: 870 },
    board: { x: 877, y: 921 },  // quest board center
    chestX: 2120,               // where the chest stands on the floor
  },
};

export async function createRoom(name, index) {
  const [meta, img] = await Promise.all([loadJSON(`env/${name}.json`), loadImg(`env/${name}.webp`)]);
  const spot = ROOMS[name];
  let tf = { x: 0, y: 0, k: 1 };

  const room = {
    name, spot,
    // art-unit height of a room/surface image at the current cover scale
    height() { return (meta.h * Math.max(stage.bg.width / meta.w, stage.bg.height / meta.h)) / devPerArt(); },
    // world y of this room's top edge
    top() { return stage.H + EARTH() + index * (room.height() + EARTH()); },
    // camera position at which the room exactly fills the screen
    restCamY() { return room.top() + room.height() - stage.H; },

    floorY: 0, board: { x: 0, y: 0 }, chestX: 0, ceiling: { x: 0, y: 0 },

    toArt(x, y) {
      const d = devPerArt();
      return { x: (tf.x + x * tf.k) / d, y: (tf.y + y * tf.k) / d };
    },

    draw(now, camY) {
      const { bctx: c, bg } = stage, d = devPerArt();
      const k = Math.max(bg.width / meta.w, bg.height / meta.h);
      const w = meta.w * k, h = meta.h * k;
      tf = { x: (bg.width - w) / 2, y: (room.top() - camY) * d, k };
      room.floorY = Math.round((tf.y + meta.groundY * k) / d);
      room.board = room.toArt(spot.board.x, spot.board.y);
      room.chestX = room.toArt(spot.chestX, 0).x;
      room.ceiling = room.toArt(meta.w / 2, 0);
      if (tf.y > bg.height || tf.y + h < 0) return; // off screen

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
