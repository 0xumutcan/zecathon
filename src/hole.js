// Draws an actor going INTO the burrow: the part still outside fades away quickly, while inside the
// opening's shape the actor stays visible as a silhouette that darkens with depth.
const scratch = new Map(); // one offscreen canvas per target size

function offscreen(w, h) {
  const key = `${w}x${h}`;
  let c = scratch.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = w; c.height = h;
    scratch.set(key, c);
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  return { c, ctx };
}

/**
 * @param target  2d context to draw on
 * @param drawActor  (ctx) => void, renders the actor in the target's coordinates
 * @param depth  0 = at the mouth, 1 = swallowed by the dark
 * @param mask   { img, x, y, w, h } opening mask placed in the target's coordinates
 */
export function drawIntoHole(target, drawActor, depth, mask) {
  if (depth <= 0) return drawActor(target);
  const { width: w, height: h } = target.canvas;
  const { c, ctx } = offscreen(w, h);
  ctx.imageSmoothingEnabled = target.imageSmoothingEnabled;
  drawActor(ctx);

  // outside the opening: gone within the first 40% of the way in
  const outside = 1 - Math.min(1, depth / 0.4);
  if (outside > 0) {
    target.save();
    target.globalAlpha = outside;
    target.drawImage(c, 0, 0);
    target.restore();
  }
  // inside the opening: keep only the part within the mask, then darken it toward black
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mask.img, mask.x, mask.y, mask.w, mask.h);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = `rgba(6, 5, 5, ${Math.min(1, 0.35 + depth * 0.65)})`;
  ctx.fillRect(0, 0, w, h);
  target.save();
  target.globalAlpha = 1 - Math.max(0, (depth - 0.75) / 0.25); // the last stretch fades into the dark
  target.drawImage(c, 0, 0);
  target.restore();
}
