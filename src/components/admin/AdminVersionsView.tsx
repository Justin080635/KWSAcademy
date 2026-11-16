import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  GitBranch,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  AssessmentQuestion,
  AssessmentSectionId,
  AssessmentVersionRecord,
  StaffRole,
} from '../../domain/types.ts';
import {
  activateAssessmentVersion,
  ApiError,
  createAssessmentVersion,
  fetchAssessmentVersions,
} from '../../services/api.ts';
import { Button } from '../ui/Button.tsx';
import { Surface } from '../ui/Surface.tsx';

interface AdminVersionsViewProps {
  staffRole: StaffRole | null;
}

export function AdminVersionsView({ staffRole }: AdminVersionsViewProps) {
  const isAdmin = staffRole === 'admin';
  const [versions, setVersions] = useState<AssessmentVersionRecord[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [newVersionId, setNewVersionId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [activateImmediately, setActivateImmediately] = useState(false);
  const [draftQuestions, setDraftQuestions] = useState<AssessmentQuestion[]>(
    []
  );
  const [saving, setSaving] = useState(false);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchAssessmentVersions();
      setVersions(res.versions);
      setActiveVersionId(res.activeVersionId);
      const active =
        res.versions.find((v) => v.versionId === res.activeVersionId) ??
        res.versions[0];
      if (active && draftQuestions.length === 0) {
        setDraftQuestions(JSON.parse(JSON.stringify(active.questions)));
        setNewVersionId(`${active.versionId}-r${res.versions.length + 1}`);
        setNewLabel(`${active.label} (Revision ${res.versions.length})`);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : 'Unable to load assessment versions.'
      );
    } finally {
      setLoading(false);
    }
  }, [draftQuestions.length]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleActivate = async (versionId: string) => {
    if (!isAdmin) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await activateAssessmentVersion(versionId);
      setStatusMsg(
        `Version ${versionId} activated for new respondents. Historical submissions remain linked to their original versions.`
      );
      await loadVersions();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : 'Failed to activate assessment version.'
      );
    }
  };

  const handleMoveQuestion = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draftQuestions.length) return;
    setDraftQuestions((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handleUpdatePrompt = (index: number, prompt: string) => {
    setDraftQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, prompt } : q))
    );
  };

  const handleRemoveQuestion = (index: number) => {
    if (draftQuestions.length <= 1) return;
    setDraftQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddQuestion = () => {
    const stamp = Date.now().toString(36).slice(-4);
    const sectionId: AssessmentSectionId = 'profile_next_steps';
    const qId = `custom_q_${stamp}`;
    setDraftQuestions((prev) => [
      ...prev,
      {
        id: qId,
        sectionId,
        kind: 'profile_survey',
        prompt: 'New question prompt',
        options: [
          { id: `${qId}_a`, label: 'Option A' },
          { id: `${qId}_b`, label: 'Option B' },
        ],
      },
    ]);
  };

  const handlePublishNewVersion = async () => {
    if (!isAdmin) return;
    if (!newVersionId.trim() || !changeSummary.trim()) {
      setErrorMsg(
        'Provide a unique version ID and change summary before creating a new immutable version.'
      );
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const created = await createAssessmentVersion({
        versionId: newVersionId.trim(),
        label: newLabel.trim() || newVersionId.trim(),
        changeSummary: changeSummary.trim(),
        questions: draftQuestions,
        activateImmediately,
      });
      setStatusMsg(
        `Created immutable version ${created.versionId} (${created.status}).`
      );
      setChangeSummary('');
      await loadVersions();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : 'Failed to create new assessment version.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--kws-ink)]">
          Question Management &amp; Assessment Versioning
        </h1>
        <p className="text-sm text-[var(--kws-muted)]">
          Prepare and publish new assessment versions cleanly. Historical
          submissions always retain their exact original version ID, question
          snapshot, and calculated results.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-[var(--kws-danger)]/40 bg-[var(--kws-danger-surface)] p-4 text-sm text-[var(--kws-danger)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {statusMsg && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface-subtle)] p-4 text-sm text-[var(--kws-ink)]">
          <Check
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--kws-success)]"
            aria-hidden="true"
          />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Version History */}
      <Surface className="p-5">
        <h2 className="font-display text-lg font-bold text-[var(--kws-ink)]">
          Immutable Assessment Versions
        </h2>
        <p className="mt-0.5 text-xs text-[var(--kws-muted)]">
          Active version:{' '}
          <strong className="font-mono-tabular text-[var(--kws-ink)]">
            {activeVersionId || 'Loading...'}
          </strong>
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-[var(--kws-muted)]">
            Loading version history...
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--kws-border)] text-[var(--kws-muted)]">
                <tr>
                  <th className="pb-2 pr-3 font-semibold">Version ID</th>
                  <th className="pb-2 pr-3 font-semibold">Label</th>
                  <th className="pb-2 pr-3 font-semibold">Status</th>
                  <th className="pb-2 pr-3 font-semibold">Questions</th>
                  <th className="pb-2 pr-3 font-semibold">Change Summary</th>
                  <th className="pb-2 pr-3 font-semibold">Created</th>
                  {isAdmin && (
                    <th className="pb-2 text-right font-semibold">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--kws-border)]">
                {versions.map((ver) => (
                  <tr key={ver.versionId}>
                    <td className="py-2.5 pr-3 font-mono-tabular font-semibold text-[var(--kws-ink)]">
                      {ver.versionId}
                    </td>
                    <td className="py-2.5 pr-3 text-[var(--kws-ink)]">
                      {ver.label}
                    </td>
                    <td className="py-2.5 pr-3 font-mono-tabular font-semibold">
                      <span
                        className={
                          ver.status === 'active'
                            ? 'text-[var(--kws-success)]'
                            : 'text-[var(--kws-muted)]'
                        }
                      >
                        {ver.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono-tabular text-[var(--kws-muted)]">
                      {ver.questions.length}
                    </td>
                    <td className="max-w-xs py-2.5 pr-3 text-[var(--kws-muted)]">
                      {ver.changeSummary}
                    </td>
                    <td className="py-2.5 pr-3 font-mono-tabular text-[var(--kws-muted)]">
                      {ver.createdAt.slice(0, 10)}
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {ver.status !== 'active' ? (
                          <Button
                            variant="secondary"
                            size="md"
                            onClick={() => handleActivate(ver.versionId)}
                          >
                            Activate
                          </Button>
                        ) : (
                          <span className="font-mono-tabular text-[var(--kws-muted)]">
                            In use
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {/* New Version Builder */}
      <Surface className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kws-border)] pb-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--kws-ink)]">
              Prepare New Question Version
            </h2>
            <p className="text-xs text-[var(--kws-muted)]">
              Add, edit, deactivate, or reorder questions below, then save as a
              new version ID.
            </p>
          </div>
          {isAdmin && (
            <Button variant="secondary" onClick={handleAddQuestion}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Question
            </Button>
          )}
        </div>

        {!isAdmin ? (
          <p className="mt-4 text-sm text-[var(--kws-muted)]">
            Only Admin role accounts can create or activate assessment question
            versions.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="ver-id"
                  className="block text-xs font-semibold text-[var(--kws-muted)]"
                >
                  New Version ID
                </label>
                <input
                  id="ver-id"
                  type="text"
                  value={newVersionId}
                  onChange={(e) => setNewVersionId(e.target.value)}
                  placeholder="kws-assessment-v2.1"
                  className="mt-1 w-full rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-3 py-2 font-mono-tabular text-sm text-[var(--kws-ink)]"
                />
              </div>
              <div>
                <label
                  htmlFor="ver-label"
                  className="block text-xs font-semibold text-[var(--kws-muted)]"
                >
                  Version Label
                </label>
                <input
                  id="ver-label"
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Cohort 2027 Revision"
                  className="mt-1 w-full rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-3 py-2 text-sm text-[var(--kws-ink)]"
                />
              </div>
              <div>
                <label
                  htmlFor="ver-summary"
                  className="block text-xs font-semibold text-[var(--kws-muted)]"
                >
                  Change Summary
                </label>
                <input
                  id="ver-summary"
                  type="text"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="Describe edits or additions..."
                  className="mt-1 w-full rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-3 py-2 text-sm text-[var(--kws-ink)]"
                />
              </div>
            </div>

            <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
              {draftQuestions.map((q, idx) => (
                <div
                  key={`${q.id}-${idx}`}
                  className="rounded-lg border border-[var(--kws-border)] bg-[var(--kws-surface-subtle)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono-tabular font-semibold text-[var(--kws-muted)]">
                      {idx + 1}. {q.id} · {q.sectionId} ·{' '}
                      {q.options.length} option(s)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Move ${q.id} up`}
                        disabled={idx === 0}
                        onClick={() => handleMoveQuestion(idx, -1)}
                        className="rounded border border-[var(--kws-border-strong)] p-2 text-[var(--kws-ink)] disabled:opacity-40 cursor-pointer"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${q.id} down`}
                        disabled={idx === draftQuestions.length - 1}
                        onClick={() => handleMoveQuestion(idx, 1)}
                        className="rounded border border-[var(--kws-border-strong)] p-2 text-[var(--kws-ink)] disabled:opacity-40 cursor-pointer"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${q.id}`}
                        onClick={() => handleRemoveQuestion(idx)}
                        className="rounded border border-[var(--kws-border-strong)] p-2 text-[var(--kws-danger)] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    aria-label={`Prompt for ${q.id}`}
                    value={q.prompt}
                    onChange={(e) => handleUpdatePrompt(idx, e.target.value)}
                    className="mt-2 w-full rounded border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-2.5 py-1.5 text-sm text-[var(--kws-ink)]"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--kws-border)] pt-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--kws-ink)]">
                <input
                  type="checkbox"
                  checked={activateImmediately}
                  onChange={(e) => setActivateImmediately(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--kws-border-strong)] accent-[var(--kws-accent)]"
                />
                Activate this new version immediately for upcoming respondents
              </label>

              <Button
                variant="primary"
                loading={saving}
                onClick={handlePublishNewVersion}
              >
                <GitBranch className="h-4 w-4" aria-hidden="true" />
                Save New Immutable Version
              </Button>
            </div>
          </div>
        )}
      </Surface>
    </div>
  );
}
