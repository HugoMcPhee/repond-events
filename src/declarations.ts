export interface RepondEventsTypesUntyped<T_Group, T_Event, T_GenericParamA> {
  EventGroups: Record<string, Record<string, any>>;
  KnownChainIds: string;
  EventParameters: any; // to type event parameter with dependant types
  EmojiKeys: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CustomRepondEventsTypes<T_Group, T_Event, T_GenericParamA> {}

// The final usable types, with the custom types overriding the default ones
export interface RepondEventsTypes<T_Group, T_Event, T_GenericParamA>
  extends Omit<
      RepondEventsTypesUntyped<T_Group, T_Event, T_GenericParamA>,
      keyof CustomRepondEventsTypes<T_Group, T_Event, T_GenericParamA>
    >,
    CustomRepondEventsTypes<T_Group, T_Event, T_GenericParamA> {}

// How to use in project:
/*
    declare module "repond-events/src/declarations" {
  interface CustomRepondEventsTypes<T_Group, T_Event, T_GenericParamA> {
    EventGroups: typeof allEventGroups;
    KnownChainIds: "mainCardAniChain" | "mainCardOpacityDelayChain" | "miniCardSetAniChain";
    EventParameters: CustomEventParameters<T_Group, T_Event, T_GenericParamA>;
    // EventParameters: never; // use never if there's no custom types to keep default types working
  }
}*/
