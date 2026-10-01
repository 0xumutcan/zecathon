// Two stacked canvases:
//  - bg: full device resolution, smooth scaling, for painted backgrounds and chunky actors (the rabbit)
//  - px: native pixel-art resolution (1 unit = 1 art pixel of the character), upscaled with no smoothing
// "Art units" below always mean px-canvas pixels.

export const stage = {
  S: 2,      // screen px per art px for the character
  DPR: 1,
  W: 0, H: 0, // px canvas size in art units
  px: null, pctx: null,
  bg: null, bctx: null,
  scrollY: 0, // smooth-scroll position (fractional), set every frame by main.js
};

// 0..1 progress through a chapter section. Uses the fractional smooth-scroll value rather than the
// page's rounded scroll position, so motion driven by it eases out without whole-pixel hiccups.
export function sectionProgress(section) {
  const span = section.offsetHeight - innerHeight;
  return Math.min(1, Math.max(0, (stage.scrollY - section.offsetTop) / span));
}

export const input = { mouse: null, lastMove: -Infinity };

export function initStage() {
  stage.px = document.getElementById("px");
  stage.pctx = stage.px.getContext("2d");
  stage.bg = document.getElementById("bg");
  stage.bctx = stage.bg.getContext("2d");
  addEventListener("resize", resize);
  addEventListener("pointermove", (e) => {
    input.mouse = { x: e.clientX / stage.S, y: e.clientY / stage.S };
    input.lastMove = performance.now();
  });
  resize();
}

function resize() {
  // the character (~220 art px tall) ends up around 40% of the viewport; integer scale keeps pixels crisp
  stage.S = Math.max(1, Math.round((innerHeight * 0.4) / 220));
  stage.W = Math.ceil(innerWidth / stage.S);
  stage.H = Math.ceil(innerHeight / stage.S);
  stage.px.width = stage.W;
  stage.px.height = stage.H;
  stage.pctx.imageSmoothingEnabled = false;
  stage.DPR = Math.min(2, devicePixelRatio || 1);
  stage.bg.width = Math.round(innerWidth * stage.DPR);
  stage.bg.height = Math.round(innerHeight * stage.DPR);
  stage.bctx.imageSmoothingQuality = "high";
  document.documentElement.style.setProperty("--px", stage.S + "px");
}

// device px on the bg canvas per art unit
export const devPerArt = () => stage.S * stage.DPR;
