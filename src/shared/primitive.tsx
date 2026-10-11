import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { CspContext, STYLE_KEY_ATTRIBUTE, styleRule, useServerMarkup } from "./csp";
import { hashText, styleToCss } from "./css";

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
    const nonce = React.use(CspContext);
    const serverMarkup = useServerMarkup();
    const style = (elementProps as { style?: React.CSSProperties }).style;
    const declarations = nonce !== undefined && serverMarkup && style ? styleToCss(style) : "";
    if (!declarations) {
      return <Component {...elementProps} />;
    }
    // A content security policy without 'unsafe-inline' drops style attributes in server markup,
    // so a style element with the policy's nonce carries them until the element hydrated; from
    // then on React sets them through the CSSOM, which no policy restricts.
    const key = hashText(declarations);
    const markupProps: Record<string, unknown> = { ...elementProps, [STYLE_KEY_ATTRIBUTE]: key };
    delete markupProps.style;
    return (
      <>
        <style nonce={nonce}>{styleRule(key, declarations)}</style>
        <Component {...markupProps} />
      </>
    );
  }
  PrimitiveElement.displayName = `Primitive.${node}`;
  return PrimitiveElement;
}

export const Primitive: Primitives = Object.fromEntries(
  NODES.map(node => [node, createPrimitive(node)]),
) as Primitives;
