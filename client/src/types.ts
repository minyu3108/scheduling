export interface SchedulerEvent {
  id: string; // Add a unique ID for each event
  start: Date;
  end: Date;
  title: string;
  isTentative?: boolean;
}