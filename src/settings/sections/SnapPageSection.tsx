import { Camera, ExternalLink } from 'lucide-react';
import { Button, Input, Segmented, SettingRow, Slider } from '@/shared/components/ui';
import { Page, Panel, type SectionProps } from '../App';

export default function SnapPageSection({ settings, update }: SectionProps) {
  const sp = settings.snappage;
  return (
    <Page title="SnapPage" description="Screenshots are captured and edited entirely in your browser. They are never uploaded.">
      <Panel title="Export">
        <SettingRow title="Default format">
          <Segmented
            label="Default format"
            value={sp.defaultFormat}
            onChange={(v) => void update({ snappage: { defaultFormat: v } })}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpeg', label: 'JPEG' },
            ]}
          />
        </SettingRow>
        <SettingRow title="JPEG quality">
          <div className="w-52">
            <Slider label="JPEG quality" min={0.5} max={1} step={0.01} value={sp.jpegQuality} onChange={(v) => void update({ snappage: { jpegQuality: v } })} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </SettingRow>
        <SettingRow title="Keep recent screenshots" description="Older captures are deleted automatically to save space.">
          <Input type="number" min={1} max={200} className="!w-24" value={sp.keepRecent} aria-label="Screenshots to keep" onChange={(e) => void update({ snappage: { keepRecent: Math.max(1, Math.min(200, Number(e.target.value) || 1)) } })} />
        </SettingRow>
      </Panel>
      <Panel title="Capturing">
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] text-muted">
          <li>Use the toolbar popup, right-click menu, or Alt+Shift+S (visible area) and Alt+Shift+R (region).</li>
          <li>Full-page capture scrolls the page and stitches the pieces together. Pages that scroll inside an inner panel, use infinite scrolling, or are extremely long may be captured partially.</li>
          <li>Chrome doesn’t allow capturing its own pages (chrome://), the Chrome Web Store, or other extensions’ pages.</li>
        </ul>
        <div className="mt-4 flex gap-2">
          <Button icon={Camera} onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('snappage.html') })}>
            Open screenshot library
          </Button>
          <Button variant="ghost" icon={ExternalLink} onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
            Change shortcuts
          </Button>
        </div>
      </Panel>
    </Page>
  );
}
