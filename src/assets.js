export const loadImg = (src) =>
  new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`failed to load ${src}`));
    i.src = src;
  });

export const loadJSON = (src) => fetch(src).then((r) => {
  if (!r.ok) throw new Error(`failed to load ${src}`);
  return r.json();
});

// a sprite sheet produced by tools/process-sprite.mjs or tools/process-pixelsheet.mjs
export async function loadSprite(dir, name, ext = "webp") {
  const [meta, img] = await Promise.all([loadJSON(`${dir}/${name}.json`), loadImg(`${dir}/${name}.${ext}`)]);
  if (meta.gaze) {
    // circle frames (the head sweep) with their angles; frame 0 is the straight-ahead pose
    meta.ring = [];
    meta.gaze.forEach(([gx, gy], i) => {
      if (Math.abs(Math.hypot(gx, gy) - 1) < 0.01) meta.ring.push({ i, a: Math.atan2(gy, gx) });
    });
  }
  meta.cols ??= meta.count;
  return { meta, img };
}

export function frameRect(meta, i) {
  return { sx: (i % meta.cols) * meta.frameW, sy: Math.floor(i / meta.cols) * meta.frameH, w: meta.frameW, h: meta.frameH };
}
