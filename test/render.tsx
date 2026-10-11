// @env browser
import type { RenderResult } from "vitest-browser-react";
import * as React from "react";
import { render } from "vitest-browser-react";

/** Renders in strict mode, so effects run twice on mount as they do during development. */
export async function renderStrict(ui: React.ReactNode): Promise<RenderResult> {
  return render(ui, { wrapper: React.StrictMode });
}

interface ErrorBoundaryProps {
  onError: (error: unknown) => void;
  children: React.ReactNode;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  override render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Renders `ui` and returns the error it throws while rendering. */
export async function renderError(ui: React.ReactNode): Promise<Error> {
  let caught: unknown;
  await render(
    <ErrorBoundary onError={(error) => {
      caught = error;
    }}
    >
      {ui}
    </ErrorBoundary>,
  );
  if (!(caught instanceof Error)) {
    throw new TypeError("Expected rendering to throw an error.");
  }
  return caught;
}

export function getById(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`No element with the id "${id}".`);
  }
  return element;
}

export function getByTestId(testId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`No element with the test id "${testId}".`);
  }
  return element;
}

export function widthOf(element: Element): number {
  return element.getBoundingClientRect().width;
}

export function heightOf(element: Element): number {
  return element.getBoundingClientRect().height;
}
