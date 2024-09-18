import { AllState, ItemType, StatePath } from "repond";
import { RepondEventsTypes } from "./declarations";

// Takes a type and keys of that type and returns a new type with those keys required
type WithRequiredProps<T, K extends keyof T> = Required<Pick<T, K>> & Omit<T, K>;

type StringWithAutocomplete<T> = T | (string & Record<never, never>);

export type KnownChainId = RepondEventsTypes<any, any, any>["KnownChainIds"];
export type ChainId = StringWithAutocomplete<KnownChainId>;

export type RunMode = "add" | "start" | "end" | "pause" | "unpause" | "suspend" | "unsuspend" | "cancel" | "skip";

// For some helpers
export type RunModeExtraOptions = {
  runBy?: string;
};

export type RunModeOptions = RunModeExtraOptions & {
  runMode: RunMode;
};

export type EventNodeLoose = { group: string; name: string; params?: Record<any, any> };

export type EventNodeLooseWithOptions = EventNodeLoose & { options?: EventInstanceOptions };

export type EventInstanceOptions = {
  chainId?: ChainId;
  liveId?: string;
  addedBy?: string;
  isParallel?: boolean;
  timePath?: StatePath<ItemType>;
  hasPriority?: boolean; // if the event should be run before other inactive events
  duration?: number; // in ms, this can always be changed by the event handler, defaults to 0
};

// For EventInstanceOptionsWithChainId, make 'chainId' non-optional
export type EventInstanceOptionsWithChainId = WithRequiredProps<EventInstanceOptions, "chainId">;

// For EventInstanceOptionsWithIds, make 'chainId' and 'liveId' non-optional
export type EventInstanceOptionsWithIds = WithRequiredProps<EventInstanceOptions, "chainId" | "liveId">;

export type EventInstance = {
  group: string;
  name: string;
  params?: Record<any, any>;
  options: EventInstanceOptions;
};

export type EventInstanceWithChainId = EventInstance & {
  options: EventInstanceOptionsWithChainId;
};

export type EventInstanceWithIds = EventInstance & {
  options: EventInstanceOptionsWithIds;
};

export type EasyEventInstance = [string, string, Record<any, any>, EventInstanceOptions];

export type EventRunLiveInfo = {
  liveId: string;
  chainId: ChainId;
  runBy: string;
  addedBy: string;
  runMode: RunMode;
  didStart: boolean;
  remainingTime: number;
  elapsedTime: number; // maybe rename to nowTime
  isUnpausing: boolean;
  isUnsuspending: boolean;
  isUnfreezing: boolean;
  isFreezing: boolean;
  isFirstAdd: boolean;
  isFirstStart: boolean;
  isFirstPause: boolean;
  isFirstSuspend: boolean;
  // times from state
  addTime: number;
  startTime: number;
  pauseTime: number;
  unpauseTime: number;
  suspendTime: number;
  unsuspendTime: number;
  goalEndTime: number;
};

export type EventTypeDefinition<T_Params extends Record<any, any>> = {
  run: (params: T_Params, liveInfo: EventRunLiveInfo) => void;
  params: T_Params; // param definitions are required for now to make the typescript happier, but they dont have to be passed into runEvent, since the defualts will be used
  isParallel?: boolean;
  id?: string; // groupName_eventName , set automatically in initEventGroups
  duration?: number; // in ms, this can always be changed by the event handler, defaults to a very large number
  timePath?: StatePath<ItemType>; // the path to the elapsed time in the state, uses the default if not set here
};

type OriginalEventGroups = RepondEventsTypes<any, any, any>["EventGroups"];
export type EmojiKeys = RepondEventsTypes<any, any, any>["EmojiKeys"] extends never
  ? Record<string, string>
  : RepondEventsTypes<any, any, any>["EmojiKeys"];

// Helper type to strip "Events" suffix from group names
type RemoveEventsSuffix<T extends string> = T extends `${infer Prefix}Events` ? Prefix : T;
export type RefinedEventGroups = {
  [K in keyof OriginalEventGroups as RemoveEventsSuffix<K>]: OriginalEventGroups[K];
};

export type EventGroupName = keyof RefinedEventGroups & string;
export type EventName<T extends EventGroupName> = keyof RefinedEventGroups[T] & string;
type EventGroups = RefinedEventGroups;

export type CustomEventParams<T_Group, T_Event, T_GenericParamA> = RepondEventsTypes<
  T_Group,
  T_Event,
  T_GenericParamA
>["EventParameters"];

export type DefaultEventParams<
  T_Group extends EventGroupName & string,
  T_Name extends EventName<T_Group> & string
> = RefinedEventGroups[T_Group][T_Name] extends { params: infer P }
  ? P
  : RefinedEventGroups[T_Group][T_Name] extends {}
  ? undefined
  : never;

export type MakeOptionalWhereUndefined<T> = Partial<T> & {
  [P in keyof T as undefined extends T[P] ? never : P]: T[P];
};

type Evaluate<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;

export type EventParams<
  T_Group extends EventGroupName,
  T_Event extends EventName<T_Group>,
  T_GenericParamA
> = CustomEventParams<T_Group, T_Event, T_GenericParamA> extends never
  ? MakeOptionalWhereUndefined<Evaluate<DefaultEventParams<T_Group, T_Event>>> // Fall back to original params if EventParameters resolves to never
  : CustomEventParams<T_Group, T_Event, T_GenericParamA>;

export type EventTuple = {
  [G in EventGroupName]: {
    [N in EventName<G>]: [G, N, DefaultEventParams<G, N>] | [G, N, DefaultEventParams<G, N>, EventInstanceOptions];
  }[EventName<G>];
}[EventGroupName];

// Helper type to determine if all properties of a type are optional
export type AllOptional<T> = {
  [P in keyof T]-?: undefined extends T[P] ? never : P;
} extends { [key: string]: never }
  ? true
  : false;

// Helper type that returns the type or `undefined` if all properties are optional
export type TypeOrUndefinedIfAllOptional<T> = AllOptional<T> extends true ? T | undefined : T;
