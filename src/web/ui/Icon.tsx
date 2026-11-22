/**
 * Icon — the single import point for the Tabler icon set (spec §7 "Icons").
 *
 * Every icon is decorative: it is always accompanied by text or an
 * `aria-label` on its control (spec §7 a11y), so nothing here is announced.
 */

import {
  IconAdjustments,
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowRight,
  IconBolt,
  IconBook,
  IconCalendar,
  IconChecks,
  IconChevronDown,
  IconClock,
  IconCoin,
  IconCopy,
  IconDeviceFloppy,
  IconDice5,
  IconDownload,
  IconFlag,
  IconFlask,
  IconFolderOpen,
  IconHelpCircle,
  IconHistory,
  IconInfoCircle,
  IconLink,
  IconLock,
  IconMedal,
  IconMoon,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRocket,
  IconShare,
  IconSquare,
  IconStar,
  IconTarget,
  IconTool,
  IconTrash,
  IconTrophy,
  IconUpload,
  IconUsers,
  IconX,
  type TablerIcon,
} from '@tabler/icons-react';

/** Curated icon set — keep this list the whole visual vocabulary of the board. */
const ICONS = {
  adjust: IconAdjustments,
  alert: IconAlertTriangle,
  arrowRight: IconArrowRight,
  bolt: IconBolt,
  book: IconBook,
  calendar: IconCalendar,
  check: IconChecks,
  chevron: IconChevronDown,
  clock: IconClock,
  coin: IconCoin,
  copy: IconCopy,
  dice: IconDice5,
  download: IconDownload,
  flag: IconFlag,
  flask: IconFlask,
  folder: IconFolderOpen,
  help: IconHelpCircle,
  history: IconHistory,
  info: IconInfoCircle,
  link: IconLink,
  lock: IconLock,
  medal: IconMedal,
  moon: IconMoon,
  newGame: IconRefresh,
  play: IconPlayerPlay,
  plus: IconPlus,
  redo: IconArrowForwardUp,
  rocket: IconRocket,
  save: IconDeviceFloppy,
  share: IconShare,
  square: IconSquare,
  star: IconStar,
  target: IconTarget,
  tool: IconTool,
  trash: IconTrash,
  trophy: IconTrophy,
  undo: IconArrowBackUp,
  upload: IconUpload,
  users: IconUsers,
  x: IconX,
} satisfies Record<string, TablerIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Pixel size; 16 fits the label rows, 20–24 suits the masthead. */
  size?: number;
  className?: string;
}

/** Decorative icon slot — pair with text or give its control an aria-label. */
export function Icon({ name, size = 16, className }: IconProps) {
  const As: TablerIcon = ICONS[name];
  return <As size={size} className={className} aria-hidden="true" focusable="false" />;
}
