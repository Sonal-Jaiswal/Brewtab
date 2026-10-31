import { Kbd } from '@/shared/components/ui';
import { BrandGlyph } from '@/shared/components/Brand';
import { Page, Panel, type SectionProps } from '../App';

const SHORTCUTS: [string, string][] = [
  ['/', 'Focus the search bar (dashboard)'],
  ['Ctrl/⌘ + K', 'Focus the search bar (dashboard)'],
  ['Alt + Enter', 'Open a search or address in a background tab'],
  ['Esc', 'Close dialogs and leave layout editing'],
];

export default function About(_: SectionProps) {
  const version = chrome.runtime.getManifest().version;
  return (
    <Page title="About & privacy">
      <Panel>
        <div className="flex items-center gap-4">
          <BrandGlyph size={48} />
          <div>
            <div className="font-display text-xl font-medium">Brewtab {version}</div>
            <div className="text-[13px] text-muted">Start every tab fresh. Free, local-first, no account.</div>
          </div>
        </div>
      </Panel>
      <Panel title="Privacy">
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] text-muted">
          <li>Brewtab has no servers. Your settings, tasks, notes, shortcuts, screen-time totals and focus history are stored in this browser profile only.</li>
          <li>Nothing is sent to Brewtab or third parties. There are no analytics, ads or tracking scripts, and no remotely loaded code.</li>
          <li>Search queries go straight from your browser to the search engine you select.</li>
          <li>Screen time is recorded as seconds per website domain per day. Full page addresses and page contents are not stored.</li>
          <li>Uninstalling Brewtab removes its data from Chrome. You can also erase everything from Data & backup.</li>
        </ul>
      </Panel>
      <Panel title="Keyboard shortcuts">
        <ul className="divide-y divide-line text-[13.5px]">
          {SHORTCUTS.map(([k, d]) => (
            <li key={d + k} className="flex items-center justify-between py-2">
              <span>{d}</span>
              <Kbd>{k}</Kbd>
            </li>
          ))}
        </ul>
      </Panel>
    </Page>
  );
}
