// The site needs a cursor and room: phones and small tablets get a pixel-art "come back on a computer" screen
// instead, and never download the heavy story (sprites, rooms, videos) at all.
import "./gate.css";

const SMALL = "(max-width: 899px), (pointer: coarse) and (max-width: 1199px)";

if (matchMedia(SMALL).matches) {
  document.documentElement.classList.add("gated");
  const gate = document.getElementById("gate");
  gate.hidden = false;
  const btn = gate.querySelector(".gate-link"), label = btn.querySelector("span");
  const url = "https://zecosystem.info/";
  btn.addEventListener("click", async () => {
    try {
      // a phone's share sheet sends it straight to a laptop (AirDrop, mail, chat); otherwise copy it
      if (navigator.share) await navigator.share({ title: "Follow the Golden Rabbit", url });
      else { await navigator.clipboard.writeText(url); label.textContent = "Link copied!"; }
    } catch {
      return; // share sheet closed: nothing to do
    }
    setTimeout(() => (label.textContent = "Send the link to my computer"), 2400);
  });
} else {
  import("./main.js");
}
