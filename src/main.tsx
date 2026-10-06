import { createRoot } from "react-dom/client";
import Game from "./Game";

const html = document.documentElement;
const isEmbed = new URLSearchParams(window.location.search).has("embed");
let isFramed = false;
try {
  isFramed = window.self !== window.top;
} catch {
  isFramed = true;
}

// "?embed=1": compact layout for fixed-size iframes (game only, fills the frame)
if (isEmbed) html.classList.add("embed");

// Full page inside an auto-height iframe (e.g. a keychron.com.au page): tell the
// host page our height so it can size the iframe, and ask it to scroll the game
// into view after a run on phones. The host snippet only accepts these from our origin.
if (isFramed && !isEmbed) {
  html.classList.add("framed");
  const post = (message: Record<string, unknown>) => window.parent.postMessage(message, "*");
  let lastHeight = 0;
  const reportHeight = () => {
    const shell = document.querySelector(".site-shell");
    const height = Math.ceil(shell ? shell.getBoundingClientRect().height : html.scrollHeight);
    if (height && Math.abs(height - lastHeight) > 1) {
      lastHeight = height;
      post({ type: "keychron-dash:height", height });
    }
  };
  new ResizeObserver(reportHeight).observe(html);
  new MutationObserver(reportHeight).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("load", reportHeight);
  window.addEventListener("keychron-dash:show-stage", () => {
    const stage = document.querySelector(".game-stage");
    if (stage) post({ type: "keychron-dash:scroll", top: stage.getBoundingClientRect().top + window.scrollY });
  });
}

createRoot(document.getElementById("root")!).render(<Game />);
