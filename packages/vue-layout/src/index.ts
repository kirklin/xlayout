import type {
  BaseData,
  LayoutOptions,
  LayoutOptionsResolved,
} from "@xlayout/layout-core";
import {
  createLayout,
} from "@xlayout/layout-core";
import { defineComponent, h, ref, watchEffect } from "vue";
import { mergeProxy } from "./merge-proxy";

export * from "@xlayout/layout-core";

export const LayoutRender = defineComponent({
  props: ["render", "props"],
  setup: (props: { render: any; props: any }) => {
    return () => {
      if (
        typeof props.render === "function"
        || typeof props.render === "object"
      ) {
        return h(props.render, props.props);
      }

      return props.render;
    };
  },
});

export function useVueLayout<TData extends BaseData>(
  options: LayoutOptions<TData>,
) {
  const resolvedOptions: LayoutOptionsResolved<TData> = mergeProxy(
    {
      state: {}, // Dummy state
      onStateChange: () => {}, // noop
      renderFallbackValue: null,
      mergeOptions(
        defaultOptions: LayoutOptions<TData>,
        options: LayoutOptions<TData>,
      ) {
        return mergeProxy(defaultOptions, options);
      },
    },
    options,
  );

  const layout = createLayout<TData>(resolvedOptions);
  // can't use `reactive` because update needs to be immutable
  const state = ref(layout.initialState);

  watchEffect(() => {
    layout.setOptions((prev) => {
      const stateProxy = new Proxy({} as typeof state.value, {
        get: (_, prop) => state.value[prop as keyof typeof state.value],
      });

      return mergeProxy(prev, options, {
        // merge the initialState and `options.state`
        // create a new proxy on each `setOptions` call
        // and get the value from state on each property access
        state: mergeProxy(stateProxy, options.state ?? {}),
        // Similarly, we'll maintain both our internal state and any user-provided
        // state.
        onStateChange: (updater: any) => {
          if (updater instanceof Function) {
            state.value = updater(state.value);
          } else {
            state.value = updater;
          }

          options.onStateChange?.(updater);
        },
      });
    });
  });

  return layout;
}
