import * as React from "react";

type UseRequiredContext<T> = (consumerName: string) => T;

/**
 * Creates a context whose consumers throw when rendered outside of the root part,
 * naming both the consumer and the part it must be rendered in.
 */
export function createRequiredContext<T>(rootName: string): readonly [React.Context<T | null>, UseRequiredContext<T>] {
  const Context = React.createContext<T | null>(null);
  Context.displayName = `${rootName}Context`;

  function useRequiredContext(consumerName: string): T {
    const value = React.use(Context);
    if (value === null) {
      throw new Error(`\`${consumerName}\` must be used within \`${rootName}\``);
    }
    return value;
  }

  return [Context, useRequiredContext] as const;
}
