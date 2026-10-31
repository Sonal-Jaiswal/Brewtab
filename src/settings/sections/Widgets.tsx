import { RotateCcw } from 'lucide-react';
import { useLayout } from '@/dashboard/components/WidgetGrid';
import { WIDGETS } from '@/dashboard/widgets/registry';
import { WIDGET_TYPES, addWidget, defaultLayout } from '@/dashboard/layout';
import { Button, SettingRow, Toggle } from '@/shared/components/ui';
import { useConfirm } from '@/shared/components/overlay';
import { Page, Panel, type SectionProps } from '../App';

export default function Widgets({ settings }: SectionProps) {
  const [layout, save] = useLayout();
  const confirm = useConfirm();
  if (!layout) return null;

  return (
    <Page title="Dashboard" description="Choose which widgets appear. To rearrange or resize them, click the layout button on the dashboard.">
      <Panel
        title="Widgets"
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            onClick={async () => {
              if (await confirm({ title: 'Reset layout?', message: 'Widgets return to their default positions and sizes. No data is deleted.', confirmLabel: 'Reset layout' })) save(defaultLayout());
            }}
          >
            Reset to default
          </Button>
        }
      >
        {WIDGET_TYPES.map((t) => {
          const def = WIDGETS[t];
          const on = layout.some((w) => w.type === t);
          const moduleOff = def.module && !settings.modules[def.module];
          return (
            <SettingRow key={t} title={def.title} description={moduleOff ? `Hidden while ${def.module} is turned off.` : def.description}>
              <Toggle label={`Show ${def.title} widget`} checked={on} onChange={(v) => save(v ? addWidget(layout, t) : layout.filter((w) => w.type !== t))} />
            </SettingRow>
          );
        })}
      </Panel>
    </Page>
  );
}
