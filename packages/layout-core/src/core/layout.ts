import type { BaseData, InitialLayoutState, Layout, LayoutOptions, LayoutOptionsResolved, LayoutState, Updater } from "../types";
import type { RequiredKeys } from "../utils";
import { functionalUpdate } from "../utils";

export interface LayoutFeature {
  getDefaultOptions?: (layout: any) => any;
  getInitialState?: (initialState?: InitialLayoutState) => any;
  createLayout?: (layout: any) => any;
}

const features = [
] as const;

export interface CoreLayoutState {}
export interface CoreOptions<TData extends BaseData> {
  data: TData[];
  state: Partial<LayoutState>;
  onStateChange: (updater: Updater<LayoutState>) => void;
  debugAll?: boolean;
  debugLayout?: boolean;
  initialState?: InitialLayoutState;
  mergeOptions?: (
    defaultOptions: LayoutOptions<TData>,
    options: Partial<LayoutOptions<TData>>
  ) => LayoutOptions<TData>;
  renderFallbackValue: any;
}

export interface CoreInstance<TData extends BaseData> {
  initialState: LayoutState;
  reset: () => void;
  options: RequiredKeys<LayoutOptionsResolved<TData>, "state">;
  setOptions: (newOptions: Updater<LayoutOptionsResolved<TData>>) => void;
  getState: () => LayoutState;
  setState: (updater: Updater<LayoutState>) => void;
  _features: readonly LayoutFeature[];
  _queue: (cb: () => void) => void;
}

export function createLayout<TData extends BaseData>(options: LayoutOptions<TData>): Layout<TData> {
  if (options.debugAll || options.debugLayout) {
    console.info("Creating Layout Instance...");
  }
  const layout = { _features: features } as unknown as Layout<TData>;
  const defaultOptions = layout._features.reduce((obj, feature) => {
    return Object.assign(obj, feature.getDefaultOptions?.(layout));
  }, {}) as LayoutOptionsResolved<TData>;
  const mergeOptions = (options: LayoutOptionsResolved<TData>) => {
    if (layout.options.mergeOptions) {
      return layout.options.mergeOptions(defaultOptions, options);
    }

    return {
      ...defaultOptions,
      ...options,
    };
  };

  const coreInitialState: CoreLayoutState = {};

  let initialState = {
    ...coreInitialState,
    ...(options.initialState ?? {}),
  } as LayoutState;

  layout._features.forEach((feature) => {
    initialState = feature.getInitialState?.(initialState) ?? initialState;
  });
  const queued: (() => void)[] = [];
  let queuedTimeout = false;

  const coreInstance: CoreInstance<TData> = {
    _features: features,
    options: {
      ...defaultOptions,
      ...options,
    },
    initialState,
    _queue: (cb) => {
      queued.push(cb);

      if (!queuedTimeout) {
        queuedTimeout = true;

        // Schedule a microtask to run the queued callbacks after
        // the current call stack (render, etc.) has finished.
        Promise.resolve()
          .then(() => {
            while (queued.length) {
              queued.shift()!();
            }
            queuedTimeout = false;
          })
          .catch(error =>
            setTimeout(() => {
              throw error;
            }),
          );
      }
    },
    reset: () => {
      layout.setState(layout.initialState);
    },
    setOptions: (updater) => {
      const newOptions = functionalUpdate(updater, layout.options);
      layout.options = mergeOptions(newOptions) as RequiredKeys<
          LayoutOptionsResolved<TData>,
          "state"
      >;
    },

    getState: () => {
      return layout.options.state as LayoutState;
    },

    setState: (updater: Updater<LayoutState>) => {
      layout.options.onStateChange?.(updater);
    },
  };

  Object.assign(layout, coreInstance);

  layout._features.forEach((feature) => {
    return Object.assign(layout, feature.createLayout?.(layout));
  });

  return layout;
}
