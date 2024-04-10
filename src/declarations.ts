export interface RepondEventsTypesUntyped {
  EventGroups: Record<string, Record<string, any>>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CustomRepondEventsTypes {}

// The final usable types, with the custom types overriding the default ones
export interface RepondEventsTypes
  extends Omit<RepondEventsTypesUntyped, keyof CustomRepondEventsTypes>,
    CustomRepondEventsTypes {}
