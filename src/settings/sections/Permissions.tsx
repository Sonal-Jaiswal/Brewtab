import { Check, ShieldCheck } from 'lucide-react';
import { OPTIONAL_PERMISSIONS, requestPermission, revokePermission, type PermissionInfo } from '@/shared/permissions';
import { usePermission } from '@/shared/hooks';
import { Badge, Button } from '@/shared/components/ui';
import { Page, Panel, type SectionProps } from '../App';

const REQUIRED: { name: string; why: string }[] = [
  { name: 'Storage', why: 'Saves your settings on this device.' },
  { name: 'Alarms', why: 'Ends focus sessions and switches schedules on time, even after Chrome restarts.' },
  { name: 'Declarative Net Request', why: 'Blocks the sites you choose. Chrome applies the rules; Brewtab doesn’t inspect your traffic.' },
  { name: 'Active tab', why: 'Lets SnapPage and NightShift act on the current tab only when you click the toolbar icon, a menu item or a shortcut.' },
  { name: 'Scripting', why: 'Injects NightShift, reading mode and screenshot helpers into a page when you ask for them.' },
  { name: 'Context menus', why: 'Adds Brewtab actions to the right-click menu.' },
  { name: 'Idle', why: 'Pauses screen-time counting when you step away from the computer.' },
  { name: 'Notifications', why: 'Tells you when a focus block or break ends.' },
  { name: 'Search', why: 'Sends dashboard searches to the search engine you chose in Chrome’s settings (the “Chrome default” option).' },
];

export default function Permissions(_: SectionProps) {
  return (
    <Page title="Permissions" description="Brewtab asks for as little as possible. Optional permissions are requested only when you turn on a feature that needs them, and can be removed here at any time.">
      <Panel title="Optional permissions">
        <div className="divide-y divide-line">
          {OPTIONAL_PERMISSIONS.map((p) => (
            <OptionalRow key={p.id} info={p} />
          ))}
        </div>
      </Panel>
      <Panel title="Always granted" description="These don’t give Brewtab access to the content of the sites you visit.">
        <ul className="divide-y divide-line">
          {REQUIRED.map((r) => (
            <li key={r.name} className="flex gap-3 py-2.5 text-[13.5px]">
              <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-muted">{r.why}</div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </Page>
  );
}

function OptionalRow({ info }: { info: PermissionInfo }) {
  const [granted, refresh] = usePermission(info.request);
  return (
    <div className="flex items-start gap-4 py-3.5">
      <ShieldCheck size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
      <div className="flex-1">
        <div className="flex items-center gap-2 font-medium">
          {info.title} {granted ? <Badge tone="success">Granted</Badge> : <Badge>Not granted</Badge>}
        </div>
        <p className="mt-0.5 text-[13px] text-muted">{info.why}</p>
        <ul className="mt-1.5 list-disc pl-4 text-[12.5px] text-muted">
          {info.enables.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
      {granted ? (
        <Button size="sm" variant="ghost" onClick={() => void revokePermission(info.request).then(refresh)}>
          Remove
        </Button>
      ) : (
        <Button size="sm" variant="primary" onClick={() => void requestPermission(info.request).then(refresh)}>
          Allow
        </Button>
      )}
    </div>
  );
}
