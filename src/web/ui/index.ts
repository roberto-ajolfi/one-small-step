/**
 * UI barrel — shared dumb primitives (spec §8.1). Nothing in `ui/` imports
 * from `components/`: the dependency runs one way, features → primitives.
 */

export * from './Badge';
export * from './Button';
export * from './CardPicker';
export * from './CardTile';
export * from './format';
export * from './Icon';
export * from './Modal';
export * from './Panel';
export * from './Tooltip';
