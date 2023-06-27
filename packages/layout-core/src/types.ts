import type { CoreInstance, CoreLayoutState, CoreOptions } from "./core/layout";
import type { PartialKeys } from "./utils";

export type Updater<T> = T | ((old: T) => T);
export type OnChangeFn<T> = (updaterOrValue: Updater<T>) => void;

export type BaseData = unknown | object;

export interface Layout<TData extends BaseData>
  extends CoreInstance<TData> {}

interface FeatureOptions<TData extends BaseData>
  extends Object {}

export type LayoutOptionsResolved<TData extends BaseData> = CoreOptions<TData> &
FeatureOptions<TData>;

export interface LayoutOptions<TData extends BaseData>
  extends PartialKeys<
        LayoutOptionsResolved<TData>,
        "state" | "onStateChange" | "renderFallbackValue"
    > {}

export interface LayoutState
  extends CoreLayoutState {}

export interface CompleteInitialLayoutState
  extends CoreLayoutState {}

export interface InitialLayoutState extends Partial<CompleteInitialLayoutState> {}
