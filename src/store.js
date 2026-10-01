// Progress kept in this browser (localStorage, "zq:" prefix) so a reload does not send anyone back up.
export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(`zq:${k}`)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`zq:${k}`, JSON.stringify(v)); } catch {} },
};
