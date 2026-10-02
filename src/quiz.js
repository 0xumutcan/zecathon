import "./quiz.css";
// The oracle's exam at the end: one question from every floor. Four out of five to pass;
// every answer explains itself, and a failed run can simply be tried again.
const QUESTIONS = [
  {
    q: "Which address keeps what you receive private?",
    a: ["One that starts with u1 (a unified, shielded address)", "One that starts with t1", "Any of them. Zcash is always private."],
    why: "A u1 address receives into your shielded balance. A t1 address is transparent: public, like Bitcoin.",
  },
  {
    q: "An exchange sent your ZEC to a t1 address. What's the move?",
    a: ["Shield it into my private balance", "Leave it there, it's fine", "Send it back to the exchange"],
    why: "Until it's shielded, that address's balance and every payment it makes are public. One tap on Shield fixes it.",
  },
  {
    q: "A stranger looks up your fully shielded payment on a block explorer. What do they learn?",
    a: ["That a transaction happened, and its fee", "Who paid whom, but not the amount", "The amount, but not who"],
    why: "Shielded to shielded, the chain only shows encrypted fingerprints. No addresses, no amount, no memo.",
  },
  {
    q: "You just shielded exactly 7.31 ZEC. Why not send exactly 7.31 ZEC out right away?",
    a: ["Matching amounts in and out can link the two", "The network doesn't allow it", "Shielded coins are locked for a day"],
    why: "Shielding shows the amount going in. If the same amount pops out right after, a watcher can connect them.",
  },
  {
    q: "You paid the ferryman with a memo. Who can read it?",
    a: ["Only the ferryman", "Anyone with a block explorer", "The miners"],
    why: "Memos on shielded payments are encrypted for the recipient. Nobody else can open them.",
  },
];
const PASS = 4;

const shuffle = (list) => list.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

export const finalQuiz = {
  eyebrow: "The Oracle",
  title: "Prove you know the way",
  intro: `Five questions, one from every floor. Get ${PASS} right and the light will change you.`,
  reward: "Pass to become a Zcash Master.",
  skip: false, // the exam needs nothing but what you just learned
  body() {
    return `
      <div class="exam">
        <div class="dots" aria-hidden="true">${QUESTIONS.map(() => "<i></i>").join("")}</div>
        <p class="qtext"></p>
        <div class="choices" role="radiogroup"></div>
        <p class="result quizwhy" role="status"></p>
        <div class="next"><span class="left"></span><button type="button" class="go" hidden>Next →</button></div>
      </div>`;
  },
  wire(panel, done) {
    const dots = [...panel.querySelectorAll(".dots i")], qtext = panel.querySelector(".qtext");
    const choices = panel.querySelector(".choices"), why = panel.querySelector(".quizwhy");
    const go = panel.querySelector(".go"), left = panel.querySelector(".next .left");
    let i = 0, score = 0, after = null;

    function ask() {
      const item = QUESTIONS[i];
      dots.forEach((d, k) => d.classList.toggle("now", k === i));
      qtext.textContent = `${i + 1}. ${item.q}`;
      why.textContent = ""; why.className = "result quizwhy";
      left.textContent = `${score} correct so far`;
      go.hidden = true;
      choices.innerHTML = "";
      for (const text of shuffle(item.a)) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = text;
        b.addEventListener("click", () => answer(b, text === item.a[0]));
        choices.append(b);
      }
    }
    function answer(b, right) {
      if (!go.hidden) return; // already answered
      if (right) score++;
      dots[i].classList.add(right ? "ok" : "no");
      choices.querySelectorAll("button").forEach((x) => {
        x.disabled = true;
        if (x.textContent === QUESTIONS[i].a[0]) x.classList.add("right");
      });
      if (!right) b.classList.add("wrong");
      why.textContent = `${right ? "Right." : "Not quite."} ${QUESTIONS[i].why}`;
      why.className = `result quizwhy ${right ? "good" : "bad"}`;
      left.textContent = `${score} correct so far`;
      const last = i === QUESTIONS.length - 1;
      go.textContent = last ? "See how I did →" : "Next →";
      after = last ? results : () => { i++; ask(); };
      go.hidden = false;
    }
    function results() {
      const passed = score >= PASS;
      qtext.textContent = passed ? `${score} out of ${QUESTIONS.length}. The orb glows.` : `${score} out of ${QUESTIONS.length}. The orb stays dim.`;
      choices.innerHTML = "";
      why.textContent = passed ? "You know the way now. Step into the light." : `The oracle wants ${PASS}. Everything you need was on the floors above; have another go.`;
      why.className = `result quizwhy ${passed ? "good" : "bad"}`;
      left.textContent = "";
      go.textContent = passed ? "Step into the light →" : "Try again";
      after = passed ? done : () => { i = 0; score = 0; dots.forEach((d) => d.classList.remove("ok", "no")); ask(); };
    }
    go.addEventListener("click", () => after?.());
    ask();
  },
};
