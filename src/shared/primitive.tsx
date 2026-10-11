import type * as React from "react";
import { Slot } from "@radix-ui/react-slot";

declare module "react" {
  interface CSSProperties {
    [variable: `--xlayout-${string}`]: string | number | undefined;
  }
}

const NODES = [
  "a",
  "aside",
  "button",
  "div",
  "footer",
  "header",
  "li",
  "main",
  "nav",
  "ol",
  "section",
  "span",
  "ul",
] as const;

type PrimitiveNode = (typeof NODES)[number];

export type PrimitiveProps<E extends PrimitiveNode> = React.ComponentProps<E> & {
  /**
   * Render the child element instead of the default element, merging props,
   * event handlers and refs onto it.
   */
  asChild?: boolean;
};

type PrimitiveComponent<E extends PrimitiveNode> = (props: PrimitiveProps<E>) => React.ReactNode;

type Primitives = { [E in PrimitiveNode]: PrimitiveComponent<E> };

function createPrimitive<E extends PrimitiveNode>(node: E): PrimitiveComponent<E> {
  function PrimitiveElement(props: PrimitiveProps<E>): React.ReactNode {
    const { asChild, ...elementProps } = props;
    const Component: React.ElementType = asChild ? Slot : node;
    return <Component {...elementProps} />;
  }
  PrimitiveElement.displayName = `Primitive.${node}`;
  return PrimitiveElement;
}

export const Primitive: Primitives = Object.fromEntries(
  NODES.map(node => [node, createPrimitive(node)]),
) as Primitives;
