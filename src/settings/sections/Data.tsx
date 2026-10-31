import { useEffect, useRef, useState } from 'react';
import { Download, History, RotateCcw, Trash2, Upload, AlertTriangle } from 'lucide-react';
import { clearAllData, createBackup, importBackup, parseBackup, restoreSnapshot, type BackupFile, type BackupSummary } from '@/storage/backup';
import { backupsRepo } from '@/storage/indexeddb/repos';
import { useLiveQuery } from '@/shared/hooks';
import { downloadBlob, timestampForFile } from '@/shared/utils';
import { Button, Input, Segmented, SettingRow, Toggle } from '@/shared/components/ui';
import { Modal, useConfirm, useToast } from '@/shared/components/overlay';
import { Page, Panel, type SectionProps } from '../App';

const LABELS: Record<keyof BackupSummary['counts'], string> = {
  tasks: 'Tasks',
  notes: 'Notes',
  usage: 'Screen-time records',
  focusSessions: 'Focus sessions',
  dashboard: 'Layout & shortcuts',
};

export default function Data(_: SectionProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const file = useRef<HTMLInputElement>(null);
  const [includeMedia, setIncludeMedia] = useState(false);
  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary; name: string } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const { data: snapshots = [] } = useLiveQuery(() => backupsRepo.list(), ['backups']);

  useEffect(() => {
    void navigator.storage?.estimate().then((e) => setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
  }, [snapshots.length]);

  async function exportNow() {
    try {
      const backup = await createBackup({ includeMedia });
      downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `brewtab-backup_${timestampForFile()}.json`);
      toast('Backup downloaded', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  }

  async function pickFile(f: File) {
    if (f.size > 200 * 1024 * 1024) return toast('That file is too large to be a Brewtab backup', 'error');
    const r = parseBackup(await f.text());
    if (!r.ok) return toast(r.error, 'error');
    setPending({ backup: r.backup, summary: r.summary, name: f.name });
  }

  return (
    <Page title="Data & backup" description="Everything Brewtab stores lives in this browser profile. Back it up, move it to another computer, or erase it.">
      <Panel title="Back up" description="Download a file with your settings, tasks, notes, shortcuts, layout, focus history and screen time.">
        <SettingRow title="Include wallpapers" description="Makes the file much larger.">
          <Toggle label="Include media" checked={includeMedia} onChange={setIncludeMedia} />
        </SettingRow>
        <Button className="mt-3" variant="primary" icon={Download} onClick={() => void exportNow()}>
          Download backup
        </Button>
      </Panel>

      <Panel title="Restore or import" description="You’ll see what’s in the file and choose how to apply it before anything changes.">
        <Button icon={Upload} onClick={() => file.current?.click()}>
          Choose backup file…
        </Button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => (e.target.files?.[0] && void pickFile(e.target.files[0]), (e.target.value = ''))} />
      </Panel>

      <Panel title="Automatic safety copies" description="Brewtab saves a copy of your data before any import that replaces it. The last 3 are kept.">
        <ul className="divide-y divide-line">
          {snapshots.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
              <History size={15} className="text-muted" aria-hidden />
              <div className="flex-1">
                <div>{new Date(s.createdAt).toLocaleString()}</div>
                <div className="text-[12.5px] text-muted">{s.reason}</div>
              </div>
              <Button
                size="sm"
                icon={RotateCcw}
                onClick={async () => {
                  if (!(await confirm({ title: 'Restore this copy?', message: 'Your current data will be replaced. A safety copy of it is saved first.', confirmLabel: 'Restore' }))) return;
                  try {
                    await restoreSnapshot(s.id);
                    toast('Data restored', 'success');
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Restore failed', 'error');
                  }
                }}
              >
                Restore
              </Button>
              <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete safety copy" onClick={() => void backupsRepo.remove(s.id)} />
            </li>
          ))}
          {snapshots.length === 0 && <li className="py-2 text-[13px] text-muted">No safety copies yet.</li>}
        </ul>
      </Panel>

      <Panel title="Storage">
        {estimate && (
          <p className="text-[13px] text-muted">
            Brewtab is using about {(estimate.usage / 1024 / 1024).toFixed(1)} MB
            {estimate.quota ? ` of ${(estimate.quota / 1024 / 1024 / 1024).toFixed(1)} GB available to it` : ''}. Wallpapers take the most space.
          </p>
        )}
      </Panel>

      <Panel title="Erase everything">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] text-muted">Deletes all Brewtab data on this device and resets every setting. This can’t be undone.</p>
          <Button variant="danger" icon={Trash2} onClick={() => setClearOpen(true)}>
            Erase all data
          </Button>
        </div>
      </Panel>

      {pending && <ImportDialog pending={pending} onClose={() => setPending(null)} />}
      <ClearDialog open={clearOpen} onClose={() => setClearOpen(false)} onBackup={() => void exportNow()} />
    </Page>
  );
}

function ImportDialog({ pending, onClose }: { pending: { backup: BackupFile; summary: BackupSummary; name: string }; onClose: () => void }) {
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [includeSettings, setIncludeSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { summary } = pending;

  async function run() {
    setBusy(true);
    try {
      const r = await importBackup(pending.backup, { mode, includeSettings });
      toast(mode === 'merge' ? `Imported: ${r.added} added, ${r.updated} updated, ${r.skipped} kept as they were` : 'Data replaced. A safety copy of your previous data was saved.', 'success');
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Import backup"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={mode === 'replace' ? 'danger' : 'primary'} disabled={busy} onClick={() => void run()}>
            {mode === 'replace' ? 'Replace my data' : 'Merge into my data'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div>
          <div className="font-medium">{pending.name}</div>
          <div className="text-[12.5px] text-muted">{summary.exportedAt ? `Created ${new Date(summary.exportedAt).toLocaleString()}` : 'Creation date unknown'}</div>
        </div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-ctl bg-subtle p-3 text-[13px]">
          {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
            <li key={k} className="flex justify-between">
              <span className="text-muted">{LABELS[k]}</span>
              <span className="bt-tabular">{summary.counts[k]}</span>
            </li>
          ))}
          <li className="flex justify-between">
            <span className="text-muted">Images</span>
            <span className="bt-tabular">{summary.media}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted">Settings</span>
            <span>{summary.hasSettings ? 'Yes' : 'No'}</span>
          </li>
        </ul>
        {summary.invalid > 0 && (
          <p className="flex items-center gap-2 text-[13px] text-danger">
            <AlertTriangle size={14} /> {summary.invalid} damaged item{summary.invalid === 1 ? '' : 's'} will be skipped.
          </p>
        )}
        <div className="space-y-2">
          <Segmented
            label="Import mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'merge', label: 'Merge' },
              { value: 'replace', label: 'Replace' },
            ]}
          />
          <p className="text-[12.5px] text-muted">
            {mode === 'merge'
              ? 'Adds items you don’t have. Where both have the same item, the more recently edited version wins. Your layout is kept.'
              : 'Deletes your current Brewtab data and uses the backup instead. A safety copy is saved first so you can undo this.'}
          </p>
        </div>
        {summary.hasSettings && (
          <SettingRow title="Also import settings" description="Theme, blocklists, schedules and preferences.">
            <Toggle label="Import settings" checked={includeSettings} onChange={setIncludeSettings} />
          </SettingRow>
        )}
      </div>
    </Modal>
  );
}

function ClearDialog({ open, onClose, onBackup }: { open: boolean; onClose: () => void; onBackup: () => void }) {
  const [text, setText] = useState('');
  const toast = useToast();
  useEffect(() => setText(''), [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Erase all Brewtab data?"
      footer={
        <>
          <Button variant="ghost" onClick={onBackup} icon={Download}>
            Download backup first
          </Button>
          <Button
            variant="danger"
            disabled={text !== 'DELETE'}
            onClick={async () => {
              await clearAllData();
              onClose();
              toast('All Brewtab data erased', 'success');
            }}
          >
            Erase everything
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">Tasks, notes, shortcuts, wallpapers, history and settings will be permanently deleted from this device.</p>
      <label className="mt-4 block space-y-1.5 text-sm">
        <span>
          Type <strong>DELETE</strong> to confirm
        </span>
        <Input data-autofocus value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </label>
    </Modal>
  );
}
