"use client";

import * as React from "react";
import { CspContext } from "../shared/csp";

export interface CspProviderProps {
  /** The nonce of the page's content security policy; the server and the browser render with the same one. */
  nonce: string;
  children?: React.ReactNode;
}

/**
 * Lets the components inside follow a content security policy that allows styles only with a
 * nonce. Server markup then carries its styles in style elements with the nonce instead of style
 * attributes, which such a policy drops, and every style element the components add has it.
 */
function CspProvider({ nonce, children }: CspProviderProps): React.ReactNode {
  return <CspContext value={nonce}>{children}</CspContext>;
}

export { CspProvider, CspProvider as Provider };
