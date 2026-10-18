import accuracy from '../../docs/guide/accuracy.md?raw';
import cli from '../../docs/guide/cli.md?raw';
import configAndPricing from '../../docs/guide/config-and-pricing.md?raw';
import costs from '../../docs/guide/costs.md?raw';
import dashboard from '../../docs/guide/dashboard.md?raw';
import firstSteps from '../../docs/guide/first-steps.md?raw';
import install from '../../docs/guide/install.md?raw';
import measures from '../../docs/guide/measures.md?raw';
import overview from '../../docs/guide/overview.md?raw';
import privacy from '../../docs/guide/privacy.md?raw';
import statuslineAndCommand from '../../docs/guide/statusline-and-command.md?raw';
import troubleshooting from '../../docs/guide/troubleshooting.md?raw';

/*
 * The docs pages. The markdown lives in docs/guide/<slug>.md (readable on GitHub, compiled into the dashboard at build
 * time by Vite's ?raw import, so the pages need no /api call and work offline). Order and grouping here are the nav order;
 * the page title shown in the nav and as the h1 comes from this list, not from the file's own `# Title` line.
 */
export const DOC_GROUPS = [
  { name: 'Start', blurb: 'What sessionscope is and how to set it up.' },
  { name: 'Concepts', blurb: 'What the numbers mean, and how far to trust them.' },
  { name: 'Use', blurb: 'Day-to-day reference for the dashboard, the commands and the settings.' },
] as const;

export type DocGroup = (typeof DOC_GROUPS)[number]['name'];

export interface DocPage {
  slug: string;
  title: string;
  group: DocGroup;
  summary: string;
  body: string;
}

export const DOC_PAGES: readonly DocPage[] = [
  { slug: 'overview', title: 'Overview', group: 'Start', summary: 'What sessionscope is, what it records, and what it does not.', body: overview },
  { slug: 'install', title: 'Install', group: 'Start', summary: 'Install the plugin and the command line, and check that they work.', body: install },
  { slug: 'first-steps', title: 'First steps', group: 'Start', summary: 'A first look at your data after installing.', body: firstSteps },
  { slug: 'measures', title: 'Measures', group: 'Concepts', summary: 'What each number and flag in the dashboard measures.', body: measures },
  { slug: 'costs', title: 'Costs', group: 'Concepts', summary: 'How costs are computed, and why an unpriced model is never counted as $0.', body: costs },
  { slug: 'privacy', title: 'Privacy', group: 'Concepts', summary: 'What is stored on this machine, and what is never stored.', body: privacy },
  { slug: 'accuracy', title: 'Accuracy', group: 'Concepts', summary: "How the numbers compare with Claude Code's own accounting, and where they differ.", body: accuracy },
  { slug: 'dashboard', title: 'Dashboard', group: 'Use', summary: 'A tour of the dashboard pages and controls.', body: dashboard },
  { slug: 'cli', title: 'Command line', group: 'Use', summary: 'The sessionscope commands and their options.', body: cli },
  { slug: 'statusline-and-command', title: 'Status line and /sessionscope', group: 'Use', summary: 'The status line and the /sessionscope command.', body: statuslineAndCommand },
  { slug: 'config-and-pricing', title: 'Configuration and pricing', group: 'Use', summary: 'Settings, environment variables and the pricing table.', body: configAndPricing },
  { slug: 'troubleshooting', title: 'Troubleshooting', group: 'Use', summary: 'Common problems and what to check first.', body: troubleshooting },
];

export const DOC_SLUGS: ReadonlySet<string> = new Set(DOC_PAGES.map((p) => p.slug));
