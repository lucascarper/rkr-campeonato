// Formatos devolvidos pela API (apps/api). O frontend só exibe: nenhuma regra é recalculada aqui.

export type CategoryCode = "RK1" | "RK2" | "RK3";

export interface DriverRef {
  id: number;
  slug: string;
  name: string;
  nickname: string;
  number: number | null;
  photo: string | null;
  /** Foto grande (900×1200), usada na faixa do pódio e nos cartões do dashboard. */
  photo_lg: string | null;
  hidden: boolean;
}

export interface EventInfo {
  number: number;
  label: string;
  date: string | null;
  location: string;
  status: "scheduled" | "done" | "cancelled";
  preseason: boolean;
}

export interface StandingRow {
  position: number;
  previous_position: number | null;
  delta: number | null;
  driver: DriverRef;
  points: number;
  per_event: Record<string, number | null>;
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  fastest_laps: number;
  gap_to_leader: number;
}

export interface Standings {
  season: number;
  category: { code: CategoryCode; name: string };
  cuts: number[];
  events: EventInfo[];
  calendar: EventInfo[];
  upto: number | null;
  rows: StandingRow[];
}

export interface PenaltyInfo {
  kind: string;
  seconds: number;
  reason: string;
}

export interface DriverRace {
  result_id: number;
  event: number;
  label: string;
  date: string | null;
  location: string;
  preseason: boolean;
  position: number | null;
  status: "FIN" | "DNF" | "DSQ" | "DNS";
  points: number;
  pole: boolean;
  fastest_lap: boolean;
  penalties: PenaltyInfo[];
  notes: string;
  discarded: boolean;
}

export interface DriverProfile {
  driver: DriverRef & { thumb: string | null };
  season: number;
  category: CategoryCode;
  category_name: string;
  upto: number | null;
  rank: number | null;
  total_drivers: number;
  discards: number;
  stats: {
    points: number;
    points_with_discard: number;
    gap_to_leader: number | null;
    races: number;
    wins: number;
    podiums: number;
    poles: number;
    fastest_laps: number;
    best_position: number | null;
    avg_position: number | null;
    penalties: number;
    penalty_seconds: number;
    finished: number;
    completion_rate: number | null;
    points_per_race: number | null;
  };
  races: DriverRace[];
  /** Corridas da categoria que o piloto não disputou (valem 0 e podem ser descartadas). */
  absences: {
    event: number;
    id: string;
    date: string | null;
    location: string;
    preseason: boolean;
    discarded: boolean;
  }[];
  discard_absences: boolean;
  series: {
    events: number[];
    labels: string[];
    event_info: EventInfo[];
    no_discard: number[];
    with_discard: number[];
    positions: (number | null)[];
    discarded_races: (number | string)[];
    discarded_events: number[];
  };
}

export interface RankEntry {
  driver_id: number;
  value: number;
  [key: string]: unknown;
}

export interface HighlightEntry {
  driver_id: number;
  race: string;
  points: number;
}

export interface Highlights {
  event: Partial<EventInfo> & { number: number };
  winners: HighlightEntry[];
  poles: HighlightEntry[];
  fastest_laps: HighlightEntry[];
  biggest_rise: { driver_id: number; from: number; to: number; value: number } | null;
}

export interface Dashboard {
  highlights: Highlights | null;
  season: number;
  category: { code: CategoryCode; name: string };
  range: { from: number | null; to: number | null };
  all_events: EventInfo[];
  availability: Record<string, boolean>;
  podium_positions: number;
  drivers: Record<string, DriverRef>;
  total_races: number;
  events: number[];
  indicators: {
    fastest_laps: { top: RankEntry[] };
    wins: { top: RankEntry[] };
    consistency: { top: RankEntry[]; n: number; min_races: number };
    penalties: { top: RankEntry[]; total: number; total_seconds: number };
  };
  extras: {
    podiums: RankEntry[];
    avg_position: RankEntry[];
    poles: RankEntry[] | null;
    avg_gain: RankEntry[] | null;
    best_lap: RankEntry[] | null;
    completion_rate: RankEntry[] | null;
    points_per_race: RankEntry[];
    streaks: { points: RankEntry[]; podiums: RankEntry[] };
    evolution?: { rises: RankEntry[]; falls: RankEntry[] };
    gap_to_leader?: { series: { driver_id: number; values: (number | null)[] }[] };
    heatmap: { events: number[]; rows: { driver_id: number; positions: (number | null)[] }[] };
  };
}

export interface CalendarEvent extends EventInfo {
  races: { label: string; category: CategoryCode | null; winner: DriverRef | null }[];
}

export interface Calendar {
  season: number;
  events: CalendarEvent[];
}
