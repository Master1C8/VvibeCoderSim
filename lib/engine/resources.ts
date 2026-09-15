import { DEFAULT_DEPLOYMENT_CHANCE, type ProjectStrategy, type TaskState } from './simulation';
import { estimateTextTokens, getOperationCommandTokens } from './usage';
import { chargeTokenCall } from './token-ledger';

export type ResourceKey = 'money' | 'motivation' | 'team';

export interface ResourceState {
  money: number;
  motivation: number;
  team: number;
}

export type ResourceEffects = Partial<Record<ResourceKey, number>>;

export interface ExtremeState {
  resource: ResourceKey;
  edge: 'low' | 'high';
  title: string;
  description: string;
}

export const NEUTRAL_RESOURCES: ResourceState = {
  money: 50,
  motivation: 50,
  team: 50,
};

export const RESOURCE_LOW_LIMIT = 30;
export const RESOURCE_HIGH_LIMIT = 70;

export const getResourceIndicatorPosition = (value: number) => Math.max(
  0,
  Math.min(100, ((value - RESOURCE_LOW_LIMIT) / (RESOURCE_HIGH_LIMIT - RESOURCE_LOW_LIMIT)) * 100),
);

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  money: 'Money',
  motivation: 'Motivation',
  team: 'Team',
};

export const RESOURCE_EDGES: Record<ResourceKey, { low: string; high: string }> = {
  money: { low: 'Broke', high: 'Loaded' },
  motivation: { low: 'Apathy', high: 'Mania' },
  team: { low: 'Outcast', high: 'Leader' },
};

export const PROGRAMMER_NAMES = [
  'Button Masher',
  'Smoothie Loaf',
  'Bug Cannon',
  'Hack Wrangler',
  'Deadline Eater',
  'Commit Spitter',
  'Linter Muncher',
  'Test Hater',
  'Prod Breaker',
  'Refactor Goblin',
  'Architecture Imp',
  'Script Paster',
  'Pixel Crusher',
  'Junior Senior',
  'Meetingosaurus',
  'Framework Fanatic',
  'Type Smasher',
  'Console Shaman',
  'Vibe Hacker',
  'Legacy Mage',
  'Kamikaze Deployer',
  'Ticket Gnawer',
  'Estimate Liar',
  'Cache Sneak',
  'Review Dodger',
  'Backlog Dweller',
  'Tab Hoarder',
  'Enterprise Being',
] as const;

const toRoman = (value: number) => {
  const numerals: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let remaining = Math.max(1, Math.floor(value));
  let result = '';
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result;
};

const pickProgrammerBaseName = () => PROGRAMMER_NAMES[Math.floor(Math.random() * PROGRAMMER_NAMES.length)];

const formatProgrammerName = (baseName: string, occurrence: number) => (
  occurrence > 1 ? `${baseName} ${toRoman(occurrence)}` : baseName
);

export const createInitialProgrammerIdentity = () => {
  const baseName = pickProgrammerBaseName();
  return {
    programmerName: baseName,
    programmerNameCounts: { [baseName]: 1 },
    programmerRoster: [baseName],
  };
};

export const ensureProgrammerIdentity = (task: TaskState): TaskState => {
  const identity = task.programmerName && task.programmerNameCounts
    ? {}
    : createInitialProgrammerIdentity();
  const estimatedHistory = estimateTextTokens(task.name)
    + task.history.reduce((sum, event) => sum + estimateTextTokens(event.description), 0);
  const ensured = {
    ...task,
    ...identity,
    deploymentChance: task.deploymentChance ?? DEFAULT_DEPLOYMENT_CHANCE,
    chatHistoryTokens: task.chatHistoryTokens || estimatedHistory,
    totalTokensSpent: task.totalTokensSpent || task.contextTokens || 0,
    programmerTokensSpent: task.programmerTokensSpent
      ?? ((task.programmerGeneration || 1) === 1
        ? task.totalTokensSpent || task.contextTokens || 0
        : task.contextTokens || 0),
  };
  return {
    ...ensured,
    programmerRoster: task.programmerRoster?.length
      ? task.programmerRoster
      : [ensured.programmerName],
  };
};

const EFFECT_PATTERNS: Record<ProjectStrategy, ResourceEffects[]> = {
  quality: [
    { money: -9, team: 8 },
    { team: 10 },
    { money: -12, motivation: -6, team: 5 },
    { motivation: -8, team: 12 },
  ],
  product: [
    { money: 5, motivation: 6 },
    { motivation: 9 },
    { money: 7, motivation: 4, team: -3 },
    { money: -5, team: 8 },
  ],
  speed: [
    { money: 12, team: -10 },
    { motivation: 12, team: -7 },
    { money: 8, motivation: 6, team: -13 },
    { motivation: 10 },
  ],
};

const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export const getChoiceResourceEffects = (
  strategy: ProjectStrategy,
  choiceLabel: string,
): ResourceEffects => {
  const patterns = EFFECT_PATTERNS[strategy];
  return patterns[hashText(choiceLabel) % patterns.length];
};

export const applyResourceEffects = (
  resources: ResourceState,
  effects: ResourceEffects,
): ResourceState => ({
  money: clamp(resources.money + (effects.money || 0)),
  motivation: clamp(resources.motivation + (effects.motivation || 0)),
  team: clamp(resources.team + (effects.team || 0)),
});

export const getExtremeState = (resources: ResourceState): ExtremeState | null => {
  const keys: ResourceKey[] = ['money', 'motivation', 'team'];
  for (const resource of keys) {
    if (resources[resource] <= RESOURCE_LOW_LIMIT) return makeExtreme(resource, 'low');
    if (resources[resource] >= RESOURCE_HIGH_LIMIT) return makeExtreme(resource, 'high');
  }
  return null;
};

const makeExtreme = (resource: ResourceKey, edge: 'low' | 'high'): ExtremeState => {
  const descriptions: Record<ResourceKey, Record<'low' | 'high', string>> = {
    money: {
      low: 'The money ran out along with the rent, subscriptions, and the last packet of noodles. Hunting for food, the programmer climbed into a dumpster after a discarded corporate lunch, slipped on a banana smoothie, and drowned in the container. The repository was left ownerless, but the package manager finally stopped asking for updates.',
      high: 'There was an indecent amount of money. The programmer bought a yacht, a data center, and the right to call both “infrastructure,” then decided to cool the server racks personally with seawater. The rack carried them into international waters, where they remain listed as a venture asset with negative availability.',
    },
    motivation: {
      low: 'Apathy won for good. The programmer lay down under the desk for five minutes, but the office robot vacuum mistook the hoodie for a large piece of trash and methodically carried them into an unmarked storage room. Nobody looked: Slack had shown “do not disturb” for three weeks, so everyone treated it as documented behavior.',
      high: 'Motivation became mania after ninety-six hours of uninterrupted refactoring. To speed development up, the programmer wired the keyboard directly into their nervous system over USB-C, but the operating system detected an unknown device and forced a reboot. The project was left with a four-hundred-arrow diagram and nobody capable of reading it.',
    },
    team: {
      low: 'The team finally declared the programmer an outcast, revoked repository access, and changed the office code. They tried to return with a laptop through the ventilation shaft, got stuck above a meeting room, and watched colleagues vote unanimously to brick up the duct as an unsupported legacy interface. The final commit still arrived from somewhere in the ceiling.',
      high: 'The programmer became such an unquestioned leader that the team carried them on an office chair straight into a board meeting. They launched the chair down the parking ramp as a symbol of rapid scaling, but it missed the turn and finished in the corporate fountain. The hero was immediately promoted to strategic adviser—which removed them from the code for good.',
    },
  };

  return {
    resource,
    edge,
    title: RESOURCE_EDGES[resource][edge],
    description: descriptions[resource][edge],
  };
};

export const getProgrammerDepartureMessage = (
  programmerName: string,
  extreme: ExtremeState,
) => `${programmerName} vanished from the project.\n\n${extreme.title.toUpperCase()}\n${extreme.description}`;

export const getSelfCodingDepartureMessage = (programmerName: string) => (
  `${programmerName} vanished from the project.\n\nMANUAL MODE\n`
  + 'When the tokens ran out, the project owner uttered the fatal words “fine, I will quickly fix one line myself” and opened the IDE. '
  + `${programmerName} tried to snatch the keyboard away to save the architecture, tangled in the cable of a second mechanical keyboard, and fell directly onto Enter. `
  + 'The terminal immediately executed an unfinished deletion command, Git registered the programmer as a conflicting binary file, and the Undo button offered a paid subscription. '
  + 'Only one final commit reached the project: “never let the user write the code themselves.”'
);

export const createSuccessor = (task: TaskState): TaskState => {
  const baseName = pickProgrammerBaseName();
  const occurrence = (task.programmerNameCounts?.[baseName] || 0) + 1;
  const programmerNameCounts = {
    ...(task.programmerNameCounts || {}),
    [baseName]: occurrence,
  };
  const programmerName = formatProgrammerName(baseName, occurrence);
  const handoffDescription = `${programmerName} took over the project and is trying to understand their predecessor's decisions.`;

  return chargeTokenCall({
    ...task,
    resources: { ...NEUTRAL_RESOURCES },
    programmerGeneration: (task.programmerGeneration || 1) + 1,
    programmerName,
    programmerNameCounts,
    programmerRoster: [
      ...(task.programmerRoster?.length ? task.programmerRoster : [task.programmerName]),
      programmerName,
    ],
    progress: Math.max(0, task.progress - 4),
    momentum: 0,
    contextTokens: 0,
    programmerTokensSpent: 0,
    status: 'Active',
    departureMessage: undefined,
    deploymentRun: undefined,
    lastUpdate: Date.now(),
    history: [
      {
        type: 'neutral' as const,
        operation: 'read' as const,
        target: 'PROJECT_HANDOFF.md',
        description: handoffDescription,
        impact: -4,
      },
      ...task.history,
    ].slice(0, 50),
  }, {
    commandTokens: getOperationCommandTokens('read'),
    assistantText: handoffDescription,
  });
};
