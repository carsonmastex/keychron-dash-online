import { createRoot } from "react-dom/client";
import Game from "./Game";

// "?embed=1": compact layout for iframes on other sites (game only, fills the frame)
if (new URLSearchParams(window.location.search).has("embed")) {
  document.documentElement.classList.add("embed");
}

createRoot(document.getElementById("root")!).render(<Game />);
