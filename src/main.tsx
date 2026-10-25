import { render } from "solid-js/web";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "./style.css";
import "./primitives.css";
import App from "./App";
import QuickEntry from "./QuickEntry";
import { installInteractionState } from "./interactions";
installInteractionState();
render(
  () =>
    new URLSearchParams(location.search).has("quick") ? (
      <QuickEntry />
    ) : (
      <App />
    ),
  document.getElementById("root")!,
);
