/**
 * Components barrel — the board areas of the web UI (spec §7/§8.1).
 *
 * Feature-first: each file owns one board area and composes the dumb
 * primitives from `ui/`. Single-file areas live directly here; the areas that
 * needed a second file (Header's save menu and dev tuning panel) keep their
 * helpers beside them.
 */

export * from './ActionLog';
export * from './BoardLayout';
export * from './CampaignLadder';
export * from './CrewPool';
export * from './DrawPile';
export * from './GameOverModal';
export * from './HandFan';
export * from './Header';
export * from './MissionPanel';
export * from './PendingWindow';
export * from './ResourceCounters';
export * from './RulesOverlay';
export * from './SaveMenu';
export * from './SovietTrack';
export * from './TechTreePanel';
export * from './TuningPanel';
export * from './TurnTracker';
