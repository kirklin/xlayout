/**
 * Runs the consumer's handler first; the internal handler is skipped when the consumer
 * called `event.preventDefault()`, which is how consumers opt out of built-in behaviour.
 */
export function composeEventHandlers<E extends { defaultPrevented: boolean }>(
  consumerHandler: ((event: E) => void) | undefined,
  internalHandler: (event: E) => void,
): (event: E) => void {
  return (event) => {
    consumerHandler?.(event);
    if (!event.defaultPrevented) {
      internalHandler(event);
    }
  };
}
