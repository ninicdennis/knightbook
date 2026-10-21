/**
 * The words in Seedling, the fictional sample project: its documents and its
 * tickets. Kept apart from seed.ts so the story can be edited without touching
 * how it is written. Every name, place and detail here is invented.
 */

export const DOCUMENTS: Record<string, string> = {
  'README.md': `# Seedling

Seedling helps home gardeners plan their beds: what to plant where, when to sow
it, and when to water it.

## What it does

- Draw your garden beds at their real size.
- Place plants on a bed, with the spacing each one needs.
- See sowing and planting dates for your region's last frost.
- Get a reminder when a bed is due for watering.

## Working on it

Plans and decisions live in [docs](docs/planting-calendar.md). Work is tracked
on the project board.
`,
  'docs/planting-calendar.md': `# Planting calendar

How Seedling works out when to sow and plant each crop.

## Dates come from the last frost

Every date is counted from the region's average last frost date. A crop's
entry says how many weeks before or after that date it is sown indoors, sown
outdoors, or planted out.

| Crop | Sow indoors | Plant out |
| --- | --- | --- |
| Tomato | 6 weeks before | 2 weeks after |
| Lettuce | 4 weeks before | 2 weeks before |
| Runner bean | 3 weeks before | 1 week after |
| Courgette | 4 weeks before | 2 weeks after |

## What we will not do yet

- Weather forecasts. A forecast changes daily; the calendar should not.
- Greenhouse and polytunnel timings, which shift every date.
`,
  'docs/decisions.md': `# Decisions

## 1. Metric first

Bed sizes and spacing are stored in centimetres and shown in the user's chosen
unit. Converting on display means one stored value and no rounding drift.

## 2. One plan per garden

A garden has one plan per year. Copying last year's plan is the way to start a
new one, rather than editing the old plan in place.
`,
}

export interface SampleTicket {
  /** A short name used to link tickets to each other and to the plan. */
  key: string
  title: string
  type: 'feature' | 'bug' | 'task' | 'research' | 'documentation'
  status: 'backlog' | 'in_progress' | 'verification' | 'done'
  body: string
  dependsOn?: string[]
  documents?: string[]
  /** Appended to the body when the ticket reaches Verification. */
  handoff?: string
  blocker?: string
  reviewed?: boolean
}

export const TICKETS: SampleTicket[] = [
  {
    key: 'beds',
    title: 'Create garden beds with a width and length',
    type: 'feature',
    status: 'done',
    reviewed: true,
    body: `## Intended outcome
A gardener can add a bed, give it a name and its size, and see it drawn to scale.

## Acceptance criteria
- A bed has a name, a width and a length in centimetres.
- Beds are drawn to scale on the garden view.
- A bed can be renamed and resized later.`,
  },
  {
    key: 'spacing',
    title: 'Tomato spacing is shown in inches when the unit is centimetres',
    type: 'bug',
    status: 'done',
    dependsOn: ['beds'],
    body: `## What happens
With the unit set to centimetres, the tomato card says "Spacing: 18". That is
inches; it should say 45 cm.

## Acceptance criteria
- Spacing is converted from the stored centimetres to the chosen unit.
- The unit is always shown after the number.`,
  },
  {
    key: 'guide',
    title: 'Write the getting-started page',
    type: 'documentation',
    status: 'done',
    reviewed: true,
    documents: ['README.md'],
    body: `## Intended outcome
A new gardener can draw their first bed and place a plant on it by following
one short page.`,
  },
  {
    key: 'drag',
    title: 'Drag plants onto the bed grid',
    type: 'feature',
    status: 'in_progress',
    dependsOn: ['beds'],
    body: `## Intended outcome
Plants are placed by dragging them from the plant list onto a bed, and they
snap to the spacing each plant needs.

## Acceptance criteria
- Dragging a plant onto a bed places it on the nearest free spot.
- A plant cannot be dropped closer to another than its spacing allows.
- The keyboard can place a plant too, without dragging.`,
  },
  {
    key: 'water',
    title: 'Water reminders for each bed',
    type: 'feature',
    status: 'verification',
    dependsOn: ['beds'],
    body: `## Intended outcome
Each bed can have a watering schedule, and the gardener is reminded when one is
due.

## Acceptance criteria
- A bed can be watered every 1 to 7 days.
- A reminder appears on the day a bed is due.
- Marking a bed as watered moves its next reminder on.`,
    handoff: `## Handoff

### What changed
Beds have a "Water every" setting. Due beds are listed at the top of the garden
view, and "Watered" moves each one's next date on.

### How it was checked
Unit tests for the schedule, including a bed watered late, and a bed due on the
day the clocks change.

### Not verified
Reminders while the app is closed; they show the next time it opens.

### For you to check
Set a bed to every 2 days, mark it watered, and check it is due again in two
days.`,
  },
  {
    key: 'frost',
    title: "Show last frost dates for the gardener's region",
    type: 'feature',
    status: 'backlog',
    documents: ['docs/planting-calendar.md'],
    body: `## Intended outcome
The planting calendar counts from the gardener's own last frost date instead of
a fixed one.`,
  },
  {
    key: 'sowing',
    title: 'List seed packets by sowing date',
    type: 'task',
    status: 'backlog',
    dependsOn: ['frost'],
    body: `## Intended outcome
The seed list is sorted by when each packet should be sown, soonest first.`,
  },
  {
    key: 'print',
    title: 'Print the garden plan on one page',
    type: 'feature',
    status: 'backlog',
    dependsOn: ['drag'],
    body: `## Intended outcome
The plan prints on one A4 or Letter page with every bed, its plants and a key.`,
  },
  {
    key: 'companions',
    title: 'Compare sources of companion-planting data',
    type: 'research',
    status: 'backlog',
    body: `## Question
Which sources say which plants grow well together, and can we use their data?`,
  },
  {
    key: 'sync',
    title: 'Keep a plan in step between a phone and a laptop',
    type: 'feature',
    status: 'backlog',
    blocker: 'Waiting on a decision about where plans are stored.',
    documents: ['docs/decisions.md'],
    body: `## Intended outcome
A plan edited on one device shows the change on the other.`,
  },
]
