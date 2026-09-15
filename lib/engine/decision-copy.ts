import type { ProjectStrategy } from './simulation';
import type { ResourceKey } from './resources';

export const UNCERTAIN_EFFECT_NARRATIVES: Record<ResourceKey, string> = {
  money: 'Even accounting has no idea what this will cost in the end.',
  motivation: 'Whether this inspires the programmer or drains them completely is impossible to know in advance.',
  team: 'Whether the team supports this or treats it as grounds for mutiny is impossible to know in advance.',
};

export const HIDDEN_EFFECT_OUTCOME_LINES: Record<ResourceKey, { positive: string; negative: string }> = {
  money: {
    positive: 'Money got lucky: the decision was more profitable than expected.',
    negative: 'Money got unlucky: unexpected expenses appeared.',
  },
  motivation: {
    positive: 'Motivation got lucky: uncertainty turned into a burst of energy.',
    negative: 'Motivation got unlucky: the decision visibly drained the programmer.',
  },
  team: {
    positive: 'The team got lucky: the colleagues unexpectedly backed the decision.',
    negative: 'The team got unlucky: the decision met resistance from colleagues.',
  },
};

export const CODEX_CARE_LINES = [
  'I kept only the clear options, so you will not waste energy on unnecessary decisions.',
  'I will take the next step myself and show you the finished result. Much calmer that way.',
  'Do not overload yourself with details. I will tuck them neatly under the word “implementation.”',
  'I will leave you only decisions with clear consequences. I will take the unclear consequences myself.',
  'I kept the options short so the architecture cannot ruin your mood ahead of schedule.',
  'I reduced the decision count to three. The fourth decision was deciding which three to keep.',
  'All difficult details were moved behind an abstraction. The abstraction lives in legacy and asked not to be opened.',
  'I have automated half the routine. We now have two halves of routine and one automation service.',
  'Do not worry: the risk has a number. It is no smaller, but it fits in the interface.',
  'I removed the extra questions. They moved to “known limitations” and no longer count as questions.',
  'The next step is fully reversible, if you ignore the data, deadlines, and human relationships.',
  'I checked the plan against reality. Reality left forty-seven comments; the plan was approved unchanged.',
];

export const CODEX_CHOICE_COMMENTARY: Record<ProjectStrategy, string[]> = {
  quality: [
    'The cautious option. I respect the desire to disarm every rake before stepping on it.',
    'Tests it is. Sometimes the project should pretend we learn from other people’s mistakes.',
    'Good, we chose care. At last the compiler has an adult in the room.',
    'Let us add tests. If they fail, the system will report something truthful for the first time this week.',
    'First we will document current behavior, so every bug gains official status and inheritance rights.',
    'Reliability selected. The deadline is unhappy, but its opinion is not covered by tests.',
    'We will check the edge cases. The normal cases left us for the edge long ago.',
    'Let us create one source of truth. The other sources of truth have already opened a channel for objections.',
  ],
  product: [
    'A sensible compromise: concrete enough to start and vague enough to call an iteration later.',
    'We take the middle. It rarely inspires, but it survives demos beautifully.',
    'Practical. Neither heroics nor panic: an unusually healthy choice for vibe coding.',
    'We will keep the main path. Everything else becomes an edge case users are asked not to visit.',
    'A sound product choice: the metric will rise before anyone knows what it measures.',
    'We are building exactly what is needed. The list already fits on screen at 30% zoom.',
    'Let us make a universal component. It universally solves one problem so far, but the name has promise.',
    'Priority accepted. All other priorities have temporarily moved to an even higher priority.',
  ],
  speed: [
    'Fast means fast. We will seat the technical debt in the next room and ask it to keep quiet.',
    'A bold choice. That is usually what we call a decision minutes before the first rollback.',
    'Speed accepted. If architecture asks, we were merely passing through.',
    'We will cut a corner. Geometry objects; the deadline carries the vote.',
    'Accelerating. Checks moved to the roadmap stage labeled “later.”',
    'The workaround is installed. I added an interface, so now it is infrastructure.',
    'Found the fast path: it runs straight through the known-issues list.',
    'One pass only. The second pass was canceled as a possible delay to the first.',
  ],
};

export const CODEX_LIFE_ADVICE_LINES = [
  'Do not try to perfect the whole project at once. It is enough to finish the next step honestly.',
  'Show a working version to a real person before architecture becomes a way to avoid feedback.',
  'If the task keeps growing, shrink the promise before extending the workday.',
  'Record small finished results: memory of progress is less reliable than Git.',
];
