// The skip card that sits beside every blocking window (quest panels, the ferryman, the exam), so judges
// and the just-curious can see the whole story without a wallet or coins in hand.
export function skipHTML({ label = "Skip this step", hint = "Just looking? Jump ahead." } = {}) {
  return `
    <button class="skip-side" type="button">
      <span class="ff" aria-hidden="true"></span>
      <span class="t">${label}</span>
      <small>${hint}</small>
    </button>`;
}
