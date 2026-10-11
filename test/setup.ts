// @env browser
import { beforeEach } from "vitest";
import "./types";

document.documentElement.style.setProperty("font-size", "16px");
document.body.style.setProperty("margin", "0");

// Firefox leaves focus with the frame of the previous test file, and elements in a frame
// without focus do not take it, from code or from clicks.
beforeEach(() => {
  window.focus();
});
