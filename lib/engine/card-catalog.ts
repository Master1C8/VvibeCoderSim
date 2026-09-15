import type { ResourceEffects } from './resources';
import type { ProjectStrategy, TaskState } from './simulation';
import type { ChoiceTemplate, ProjectPhase, ProjectProfile } from './decision-types';
import { getDecisionSeed } from './decision-random';

export const makeCodexChoice = (
  label: string,
  description: string,
  strategy: ProjectStrategy,
  overrides: Partial<ChoiceTemplate> = {},
): ChoiceTemplate => {
  const defaults: Record<ProjectStrategy, Omit<ChoiceTemplate, 'label' | 'description' | 'strategy'>> = {
    quality: {
      tone: 'safe',
      progressDelta: -0.2,
      momentumDelta: 0.05,
      eventType: 'decision',
    },
    product: {
      tone: 'balanced',
      progressDelta: 1.4,
      momentumDelta: 0.35,
      eventType: 'decision',
    },
    speed: {
      tone: 'risky',
      progressDelta: 3.8,
      momentumDelta: 0.8,
      eventType: 'risky_shortcut',
    },
  };

  return { label, description, strategy, ...defaults[strategy], ...overrides };
};

type ComicChoiceFactory = (profile: ProjectProfile) => ChoiceTemplate;

const comicChoice = (
  label: string,
  description: string,
  strategy: ProjectStrategy,
  resourceEffects: ResourceEffects,
  overrides: Partial<ChoiceTemplate> = {},
) => makeCodexChoice(label, description, strategy, { ...overrides, resourceEffects });

const OUTSIDE_HELP_CHOICES: ComicChoiceFactory[] = [
  () => comicChoice('Ask someone smart to take a look', 'Call an experienced friend: your ego takes a small hit, but the team finally gets a coherent plan.', 'quality', { motivation: -3, team: 12 }),
  () => comicChoice('Hire a random freelancer', 'Give part of the task to the first five-star stranger: the budget suffers and the team starts asking awkward questions.', 'speed', { money: -12, team: -8 }),
  () => comicChoice('Buy an hour with an architect', 'Pay for a diagram that suddenly turns the argument into a shared plan.', 'quality', { money: -14, team: 12 }),
  () => comicChoice('Invite an old colleague for pizza', 'They recognize the familiar scent of workarounds and reconcile everyone faster than any RFC.', 'product', { money: -7, motivation: 8, team: 10 }),
  () => comicChoice('Post a Stack Overflow bounty', 'Pay a stranger for a ready-made answer and feel a cautious surge of hope.', 'speed', { money: -6, motivation: 6 }),
  () => comicChoice('Bribe QA with pizza', 'Food costs money, but the bugs appear before the users and relations briefly warm up.', 'product', { money: -5, team: 9 }),
  profile => comicChoice('Order a grown-up audit', `Ask outsiders to judge ${profile.mainRisk} honestly: expensive and demoralizing, but it ends the civil war.`, 'quality', { money: -12, motivation: -4, team: 11 }),
  () => comicChoice('Sponsor the dependency maintainer', 'Send money instead of an angry issue. The maintainer replies, and faith in open source returns.', 'product', { money: -9, motivation: 6 }),
  () => comicChoice('Put an intern on it', 'The intern is energized and does not yet know the task is considered hopeless. The team knows and quietly panics.', 'speed', { motivation: 9, team: -10 }),
  profile => comicChoice('Show the demo to Mom', `Ask someone with no context to try ${profile.coreFlow}. Confidence rises regardless of the result.`, 'product', { motivation: 7 }),
  () => comicChoice('Pull DevOps out of vacation', 'The deploy and programmer spring to life; relations with the person by the sea do the opposite.', 'speed', { motivation: 9, team: -13 }),
  () => comicChoice('Buy “Senior in a Weekend”', 'The budget shrinks, but confidence reaches principal level by Sunday.', 'product', { money: -9, motivation: 11 }),
];

const MANAGEMENT_CHOICES: ComicChoiceFactory[] = [
  () => comicChoice('Ask the manager for help', 'The manager secures time and people, but introduces calls, status reports, and controlled unfreedom.', 'product', { money: 8, motivation: -6, team: 10 }),
  () => comicChoice('Ask Product to drop a feature', 'A deleted feature saves budget and energizes the developer better than any motivational speech.', 'product', { money: 10, motivation: 7 }),
  () => comicChoice('Schedule a four-hour call', 'Motivation will not survive the fourth discussion loop, but everyone gets to say they were heard.', 'quality', { motivation: -11, team: 7 }),
  () => comicChoice('Hold a Slack vote', 'The decision will not get smarter, but at least the team can lose democratically.', 'quality', { team: 11 }),
  () => comicChoice('Tell the client the truth', 'Admit the problem, lose part of the fee, and regain the trust of those who must maintain it.', 'quality', { money: -9, team: 12 }),
  () => comicChoice('Ask for more budget', 'Money appears; morale drops after a forty-seven-slide presentation.', 'product', { money: 12, motivation: -5 }),
  () => comicChoice('Declare tech debt a strategic initiative', 'The rename brings budget and inspiration, but colleagues notice the bugs only received new branding.', 'speed', { money: 7, motivation: 8, team: -10 }),
  () => comicChoice('Blame the requirements', 'The budget is saved for now, while the analyst creates a private chat without the programmer.', 'speed', { money: 6, team: -12 }),
  () => comicChoice('Declare an internal hackathon', 'Pizza and prizes consume money, but everyone catches fire and becomes a team again for one day.', 'product', { money: -10, motivation: 12, team: 9 }),
  () => comicChoice('Let the team decide', 'The programmer releases control, and the team feels like a team for the first time all week.', 'quality', { team: 12 }),
  () => comicChoice('Show the demo to an investor', 'Success brings money and delusions of grandeur; the team will not forgive the “built by one person” slide.', 'speed', { money: 13, motivation: 10, team: -8 }),
  () => comicChoice('Move the deadline and call it discovery', 'The new name energizes the developer and irritates everyone who already changed their plans.', 'speed', { motivation: 6, team: -9 }),
];

const QUESTIONABLE_TECH_CHOICES: ComicChoiceFactory[] = [
  () => comicChoice('Declare the bug a feature', 'Nothing needs fixing: the budget is safe, while the team gets to explain it to users.', 'speed', { money: 9, team: -12 }),
  () => comicChoice('Copy a forum answer from 2014', 'The forum solution instantly restores confidence. Nobody has noticed the word AngularJS yet.', 'speed', { motivation: 6 }),
  () => comicChoice('Rewrite everything in a trendy framework', 'Licenses and migration cost money, the new toy sparks joy, and the team loses its last shared branch.', 'speed', { money: -12, motivation: 12, team: -9 }),
  () => comicChoice('Build it all alone overnight', 'Motivation accelerates dangerously, and the team discovers an entirely new project in the morning.', 'speed', { motivation: 13, team: -11 }),
  profile => comicChoice('Delete half the features', `Keep only ${profile.coreFlow}: cheaper, livelier, and slightly insulting to whoever designed the rest.`, 'product', { money: 11, motivation: 8, team: -6 }),
  () => comicChoice('Promote the rubber duck to tech lead', 'The duck listens without interrupting. The programmer is inspired; the humans sense competition.', 'product', { motivation: 8, team: -5 }),
  () => comicChoice('Roll back and tell nobody', 'The work works again and the budget is safe, while team trust rolls back separately.', 'speed', { money: 5, team: -11 }),
  () => comicChoice('Disable tests until Monday', 'The build is green, the budget intact, and the programmer happy. The team already knows what Monday brings.', 'speed', { money: 10, motivation: 9, team: -13 }),
  () => comicChoice('Rename the error to a warning', 'Less red, more optimism, noticeably less respect from colleagues.', 'speed', { motivation: 5, team: -9 }),
  () => comicChoice('Leave the TODO in production', 'It saves money today; tomorrow the team inherits an archaeological monument.', 'speed', { money: 9, team: -10 }),
  () => comicChoice('Buy a second mechanical keyboard', 'Productivity stays the same, but the new keyboard creates a convincing sense of progress.', 'product', { money: -8, motivation: 9 }),
  () => comicChoice('Clear the cache and believe', 'The ancient ritual restores hope. Sometimes that lasts until the next build.', 'speed', { motivation: 7 }),
];

const DEPLOYMENT_CHANCE_CHOICES: ComicChoiceFactory[] = [
  () => comicChoice(
    'Buy a full deployment rehearsal',
    'Bring up an exact production copy and break everything once without real users. The next deploy becomes much safer.',
    'quality',
    { money: -18, team: 5 },
    { deploymentChanceDelta: 10, acknowledgement: 'Paying for a full release rehearsal. The budget looks worse, but at least production will not be the first to see this code.' },
  ),
  () => comicChoice(
    'Order an infrastructure audit',
    'Give a large portion of the money to gray-bearded people so they can find the most expensive failure modes in advance.',
    'quality',
    { money: -16, motivation: -4, team: 7 },
    { deploymentChanceDelta: 8, acknowledgement: 'The auditors found problems, called them systemic, and issued a systemic invoice. Release odds rose with the amount of unpleasant truth.' },
  ),
  () => comicChoice(
    'Rent a shadow production stack',
    'Buy a second set of servers for a week and run real traffic through it. Very expensive, but the future deploy becomes predictable.',
    'quality',
    { money: -20, team: 6 },
    { deploymentChanceDelta: 12, acknowledgement: 'Shadow production is up and already looks alarmingly real. We bought an expensive chance to fail early.' },
  ),
  () => comicChoice(
    'Commission an independent release review',
    'Pay an outside team to inspect migrations, rollback, and monitoring. The developer takes offense; the release gets stronger.',
    'quality',
    { money: -14, motivation: -6, team: 8 },
    { deploymentChanceDelta: 7, acknowledgement: 'The independent review is complete. Self-esteem received comments, but the release plan survived independent reality for the first time.' },
  ),
  () => comicChoice(
    'Sell staging to save money',
    'Free the budget by shutting down the environment normally used to test releases. More money, much worse deployment odds.',
    'speed',
    { money: 14, motivation: 5, team: -8 },
    { deploymentChanceDelta: -9, acknowledgement: 'Staging is off and the budget is saved. The next production deploy will double as an integration test—very economical.' },
  ),
  () => comicChoice(
    'Cancel the load tests',
    'Save time and money by officially declaring real traffic a future problem. The release becomes cheaper and more dangerous.',
    'speed',
    { money: 11, motivation: 7, team: -6 },
    { deploymentChanceDelta: -7, acknowledgement: 'Load tests canceled. The graphs are perfectly flat because we stopped drawing them; the chance of a calm release followed suit.' },
  ),
];

const PHASE_OFFSETS: Record<ProjectPhase, number> = {
  foundation: 0,
  experience: 3,
  data: 6,
  hardening: 9,
  release: 12,
};

export const getPhaseChoices = (
  task: TaskState,
  profile: ProjectProfile,
  phase: ProjectPhase,
): ChoiceTemplate[] => {
  const seed = getDecisionSeed(task) + PHASE_OFFSETS[phase];
  const choices: ComicChoiceFactory[] = [
    OUTSIDE_HELP_CHOICES[seed % OUTSIDE_HELP_CHOICES.length],
    MANAGEMENT_CHOICES[Math.floor(seed / 7) % MANAGEMENT_CHOICES.length],
    QUESTIONABLE_TECH_CHOICES[Math.floor(seed / 13) % QUESTIONABLE_TECH_CHOICES.length],
  ];
  if (seed % 12 === 0) {
    const slot = Math.floor(seed / 12) % choices.length;
    choices[slot] = DEPLOYMENT_CHANCE_CHOICES[Math.floor(seed / 36) % DEPLOYMENT_CHANCE_CHOICES.length];
  }
  return choices.map(factory => factory(profile));
};
