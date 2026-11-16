import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import {
  ASSESSMENT_SECTIONS,
  ASSESSMENT_STEPS,
} from '../../domain/assessmentContent.ts';
import {
  isStepComplete,
  validateContactDetails,
} from '../../domain/scoring.ts';
import type {
  AssessmentSectionId,
  QuestionTelemetryInput,
  RespondentAnswers,
} from '../../domain/types.ts';
import { useQuestionTiming } from '../../state/useQuestionTiming.ts';
import { Button } from '../ui/Button.tsx';
import { Surface } from '../ui/Surface.tsx';
import { CapabilityCardView } from './CapabilityCardView.tsx';

interface AssessmentQuestionViewProps {
  stepIndex: number;
  answers: RespondentAnswers;
  isSubmitting: boolean;
  submitError: string | null;
  onSelectOption: (
    questionId: string,
    optionId: string,
    sectionId?: AssessmentSectionId
  ) => void;
  onChangeOtherText: (questionId: string, text: string) => void;
  onUpdateContact: (patch: Partial<RespondentAnswers['contact']>) => void;
  onStepChange: (nextStep: number) => void;
  onSubmit: () => void;
  onExitToWelcome: () => void;
  onEmitTelemetry?: (events: QuestionTelemetryInput[]) => void;
  onAbandonmentBeacon?: (event: QuestionTelemetryInput) => void;
}

const OPTION_LETTERS = 'ABCDEFGH';

export function AssessmentQuestionView({
  stepIndex,
  answers,
  isSubmitting,
  submitError,
  onSelectOption,
  onChangeOtherText,
  onUpdateContact,
  onStepChange,
  onSubmit,
  onExitToWelcome,
  onEmitTelemetry,
  onAbandonmentBeacon,
}: AssessmentQuestionViewProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showContactErrors, setShowContactErrors] = useState(false);
  const enteredSectionsRef = useRef<Set<AssessmentSectionId>>(new Set());

  const totalSteps = ASSESSMENT_STEPS.length;
  const currentStep = ASSESSMENT_STEPS[stepIndex];
  const currentSection = ASSESSMENT_SECTIONS.find(
    (s) => s.id === currentStep.sectionId
  );
  const currentSectionIndex = ASSESSMENT_SECTIONS.findIndex(
    (s) => s.id === currentStep.sectionId
  );

  const previousStep = stepIndex > 0 ? ASSESSMENT_STEPS[stepIndex - 1] : null;
  const nextStepObj =
    stepIndex < totalSteps - 1 ? ASSESSMENT_STEPS[stepIndex + 1] : null;
  const isSectionFirst =
    !previousStep || previousStep.sectionId !== currentStep.sectionId;
  const isSectionLast =
    !nextStepObj || nextStepObj.sectionId !== currentStep.sectionId;

  const isLastStep = stepIndex === totalSteps - 1;
  const canProceed = isStepComplete(stepIndex, answers);

  const contactValidation = validateContactDetails(answers.contact);

  const activeQuestionId =
    currentStep.kind === 'question' ? currentStep.question.id : null;

  const handleLeaveAbandon = useCallback(
    (payload: {
      questionId: string;
      sectionId: AssessmentSectionId;
      timing: { activeTimeMs: number; inactiveTimeMs: number; wallTimeMs: number };
    }) => {
      onAbandonmentBeacon?.({
        eventType: 'assessment_abandoned',
        sectionId: payload.sectionId,
        questionId: payload.questionId,
        activeTimeMs: payload.timing.activeTimeMs,
        inactiveTimeMs: payload.timing.inactiveTimeMs,
        wallTimeMs: payload.timing.wallTimeMs,
      });
    },
    [onAbandonmentBeacon]
  );

  const { getTimingSnapshot, markProgressed } = useQuestionTiming(
    activeQuestionId,
    currentStep.sectionId,
    handleLeaveAbandon
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setShowContactErrors(false);
  }, [stepIndex]);

  useEffect(() => {
    const events: QuestionTelemetryInput[] = [];
    if (!enteredSectionsRef.current.has(currentStep.sectionId)) {
      enteredSectionsRef.current.add(currentStep.sectionId);
      events.push({
        eventType: 'section_entered',
        sectionId: currentStep.sectionId,
      });
    }
    if (currentStep.kind === 'question') {
      events.push({
        eventType: 'question_displayed',
        sectionId: currentStep.sectionId,
        questionId: currentStep.question.id,
      });
    }
    if (events.length > 0) {
      onEmitTelemetry?.(events);
    }
  }, [stepIndex, currentStep, onEmitTelemetry]);

  // Compute progress fraction within the active section for the 4-section segmented bar
  const sectionSteps = ASSESSMENT_STEPS.filter(
    (s) => s.sectionId === currentStep.sectionId
  );
  const indexInSection = sectionSteps.findIndex((s) => s.id === currentStep.id);
  const activeSectionPct =
    sectionSteps.length > 0
      ? Math.round(((indexInSection + 1) / sectionSteps.length) * 100)
      : 0;

  const handleNextQuestion = () => {
    if (isSubmitting) return;
    if (
      currentStep.kind === 'question' &&
      currentStep.question.kind === 'contact_details' &&
      !contactValidation.valid
    ) {
      setShowContactErrors(true);
      return;
    }
    if (!canProceed) return;

    if (currentStep.kind === 'question') {
      const timing = getTimingSnapshot();
      markProgressed();
      const events: QuestionTelemetryInput[] = [
        {
          eventType: 'continue_clicked',
          sectionId: currentStep.sectionId,
          questionId: currentStep.question.id,
          optionId: answers.selections[currentStep.question.id] ?? '',
          activeTimeMs: timing.activeTimeMs,
          inactiveTimeMs: timing.inactiveTimeMs,
          wallTimeMs: timing.wallTimeMs,
        },
      ];
      if (isSectionLast) {
        events.push({
          eventType: 'section_completed',
          sectionId: currentStep.sectionId,
        });
      }
      onEmitTelemetry?.(events);
    }

    if (isLastStep) {
      onSubmit();
    } else {
      onStepChange(stepIndex + 1);
    }
  };

  const handleBack = () => {
    if (isSubmitting) return;
    if (currentStep.kind === 'question') {
      const timing = getTimingSnapshot();
      markProgressed();
      onEmitTelemetry?.([
        {
          eventType: 'back_clicked',
          sectionId: currentStep.sectionId,
          questionId: currentStep.question.id,
          activeTimeMs: timing.activeTimeMs,
          inactiveTimeMs: timing.inactiveTimeMs,
          wallTimeMs: timing.wallTimeMs,
        },
      ]);
    }
    if (stepIndex > 0) {
      onStepChange(stepIndex - 1);
    } else {
      onExitToWelcome();
    }
  };

  return (
    <div className="mx-auto max-w-[780px] px-4 py-6 sm:px-6 sm:py-10">
      {/* Four-Section Segmented Progress Indicator (No intimidating question counter) */}
      <nav aria-label="Assessment sections" className="mb-6 space-y-2.5">
        <div className="flex items-center justify-between text-xs text-[var(--kws-muted)]">
          <span className="font-semibold text-[var(--kws-ink)]">
            {currentSection?.partLabel}
          </span>
          <span className="font-mono-tabular">
            Section {currentSection?.code} of D
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {ASSESSMENT_SECTIONS.map((sec, idx) => {
            const isCompleted = idx < currentSectionIndex;
            const isActive = idx === currentSectionIndex;
            const fillPct = isCompleted ? 100 : isActive ? activeSectionPct : 0;

            return (
              <div key={sec.id} className="min-w-0 space-y-1.5">
                <div
                  role="progressbar"
                  aria-label={sec.title}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={fillPct}
                  className="h-2 w-full overflow-hidden rounded-full bg-[var(--kws-border)]"
                >
                  <div
                    className="h-full bg-[var(--kws-accent)] transition-all duration-300 ease-out"
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
                <p
                  className={`truncate text-[11px] sm:text-xs ${
                    isActive
                      ? 'font-semibold text-[var(--kws-ink)]'
                      : isCompleted
                        ? 'font-medium text-[var(--kws-muted)]'
                        : 'text-[var(--kws-muted)]/70'
                  }`}
                >
                  {sec.code}. {sec.navLabel}
                </p>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Section Intro Banner on First Step of Each Section */}
      {isSectionFirst && currentSection && (
        <Surface subtle className="mb-5 px-4 py-3.5 sm:px-5">
          <p className="text-sm leading-relaxed text-[var(--kws-muted)]">
            {currentSection.instructions}
          </p>
        </Surface>
      )}

      {/* Active Step Content */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={currentStep.id}
          initial={
            prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }
          }
          animate={{ opacity: 1, y: 0 }}
          exit={
            prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }
          }
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          {currentStep.kind === 'capability_card' ? (
            <CapabilityCardView
              card={currentStep.card}
              answers={answers}
              onSelectOption={onSelectOption}
              onBackCard={handleBack}
              onContinueCard={() => {
                if (isSectionLast) {
                  onEmitTelemetry?.([
                    {
                      eventType: 'section_completed',
                      sectionId: currentStep.sectionId,
                    },
                  ]);
                }
                onStepChange(stepIndex + 1);
              }}
              onEmitTelemetry={onEmitTelemetry}
              onAbandonmentBeacon={onAbandonmentBeacon}
            />
          ) : (
            (() => {
              const question = currentStep.question;
              const selectedOptionId = answers.selections[question.id];
              const selectedOption = question.options.find(
                (o) => o.id === selectedOptionId
              );

              return (
                <Surface className="p-5 sm:p-7">
                  <h1 className="font-display text-xl font-bold leading-snug text-[var(--kws-ink)] sm:text-2xl [text-wrap:balance]">
                    {question.prompt}
                  </h1>

                  {question.kind === 'contact_details' ? (
                    <div className="mt-5 space-y-5">
                      <p className="rounded-lg border border-[var(--kws-border)] bg-[var(--kws-surface-subtle)] p-3.5 text-sm leading-relaxed text-[var(--kws-muted)]">
                        We ask for your contact and location details so KWS
                        Academy can keep a record of your discovery report,
                        understand regional demand across cities and states, and
                        reach out if you requested a consultation. Your
                        personalized results are shown immediately on screen
                        regardless of whether you request a consultation.
                      </p>

                      <div>
                        <label
                          htmlFor="kws-full-name"
                          className="block text-sm font-semibold text-[var(--kws-ink)]"
                        >
                          Full name{' '}
                          <span className="text-[var(--kws-danger)]">*</span>
                        </label>
                        <input
                          id="kws-full-name"
                          type="text"
                          autoComplete="name"
                          required
                          value={answers.contact.fullName}
                          onChange={(e) =>
                            onUpdateContact({ fullName: e.target.value })
                          }
                          placeholder="Enter your full name"
                          className="mt-1.5 w-full rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-3.5 py-2.5 text-base text-[var(--kws-ink)] placeholder:text-[var(--kws-muted)]/70 focus:border-[var(--kws-accent)]"
                        />
                        {showContactErrors &&
                          contactValidation.errors.fullName && (
                            <p className="mt-1 text-xs text-[var(--kws-danger)]">
                              {contactValidation.errors.fullName}
                            </p>
                          )}
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="kws-whatsapp"
                            className="block text-sm font-semibold text-[var(--kws-ink)]"
                          >
                            WhatsApp number (with country code){' '}
                            <span className="text-[var(--kws-danger)]">*</span>
                          </label>
                          <input
                            id="kws-whatsapp"
                            type="tel"
                            autoComplete="tel"
                            required
                            value={answers.contact.whatsappNumber}
                            onChange={(e) =>
                              onUpdateContact({
                                whatsappNumber: e.target.value,
                              })
                            }
                            placeholder="+234..."
                            className="mt-1.5 w-full rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-3.5 py-2.5 text-base text-[var(--kws-ink)] placeholder:text-[var(--kws-muted)]/70 focus:border-[var(--kws-accent)]"
                          />
                          {showContactErrors &&
                            contactValidation.errors.whatsappNumber && (
                              <p className="mt-1 text-xs text-[var(--kws-danger)]">
                                {contactValidation.errors.whatsappNumber}
                              </p>
                            )}
                        </div>

                        <div>
                          <label
                            htmlFor="kws-email"
                            className="block text-sm font-semibold text-[var(--kws-ink)]"
                          >
                            Email address{' '}
                            <span className="text-[var(--kws-danger)]">*</span>
                          </label>
                          <input
                            id="kws-email"
                            type="email"
                            autoComplete="email"
                            required
                            value={answers.contact.email}
                            onChange={(e) =>
                              onUpdateContact({ email: e.target.value })
                            }
                            placeholder="you@example.com"
                            className="mt-1.5 w-full rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-3.5 py-2.5 text-base text-[var(--kws-ink)] placeholder:text-[var(--kws-muted)]/70 focus:border-[var(--kws-accent)]"
                          />
                          {showContactErrors &&
                            contactValidation.errors.email && (
                              <p className="mt-1 text-xs text-[var(--kws-danger)]">
                                {contactValidation.errors.email}
                              </p>
                            )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="kws-city"
                            className="block text-sm font-semibold text-[var(--kws-ink)]"
                          >
                            City{' '}
                            <span className="text-[var(--kws-danger)]">*</span>
                          </label>
                          <input
                            id="kws-city"
                            type="text"
                            autoComplete="address-level2"
                            required
                            value={answers.contact.city}
                            onChange={(e) =>
                              onUpdateContact({ city: e.target.value })
                            }
                            placeholder="e.g. Ikeja"
                            className="mt-1.5 w-full rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-3.5 py-2.5 text-base text-[var(--kws-ink)] placeholder:text-[var(--kws-muted)]/70 focus:border-[var(--kws-accent)]"
                          />
                          {showContactErrors &&
                            contactValidation.errors.city && (
                              <p className="mt-1 text-xs text-[var(--kws-danger)]">
                                {contactValidation.errors.city}
                              </p>
                            )}
                        </div>

                        <div>
                          <label
                            htmlFor="kws-state"
                            className="block text-sm font-semibold text-[var(--kws-ink)]"
                          >
                            State{' '}
                            <span className="text-[var(--kws-danger)]">*</span>
                          </label>
                          <input
                            id="kws-state"
                            type="text"
                            autoComplete="address-level1"
                            required
                            value={answers.contact.state}
                            onChange={(e) =>
                              onUpdateContact({ state: e.target.value })
                            }
                            placeholder="e.g. Lagos"
                            className="mt-1.5 w-full rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-3.5 py-2.5 text-base text-[var(--kws-ink)] placeholder:text-[var(--kws-muted)]/70 focus:border-[var(--kws-accent)]"
                          />
                          {showContactErrors &&
                            contactValidation.errors.state && (
                              <p className="mt-1 text-xs text-[var(--kws-danger)]">
                                {contactValidation.errors.state}
                              </p>
                            )}
                        </div>
                      </div>

                      <div className="pt-1">
                        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--kws-ink)]">
                          <input
                            type="checkbox"
                            checked={answers.contact.whatsappConsent}
                            onChange={(e) =>
                              onUpdateContact({
                                whatsappConsent: e.target.checked,
                              })
                            }
                            className="mt-1 h-4 w-4 rounded border-[var(--kws-border-strong)] accent-[var(--kws-accent)]"
                          />
                          <span>
                            I agree to receive my assessment report and relevant
                            KWS Academy follow-up through WhatsApp.
                          </span>
                        </label>
                        <p className="mt-2 text-xs text-[var(--kws-muted)]">
                          Your results are shown immediately on screen whether
                          or not you tick this box.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div
                      role="radiogroup"
                      aria-label={question.prompt}
                      className="mt-5 space-y-2.5"
                    >
                      {question.options.map((opt, idx) => {
                        const isSelected = selectedOptionId === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() =>
                              onSelectOption(
                                question.id,
                                opt.id,
                                currentStep.sectionId
                              )
                            }
                            className={`group flex w-full min-h-[52px] items-start justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-all duration-150 ease-out cursor-pointer active:scale-[0.995] ${
                              isSelected
                                ? 'border-[var(--kws-accent)] bg-[var(--kws-surface-subtle)] ring-1 ring-[var(--kws-accent)]'
                                : 'border-[var(--kws-border)] bg-[var(--kws-surface)] hover:border-[var(--kws-border-strong)] hover:bg-[var(--kws-surface-subtle)]/50'
                            }`}
                          >
                            <div className="flex items-start gap-3 text-sm leading-relaxed sm:text-base">
                              <span
                                className={`mt-0.5 inline-flex min-w-[1.5rem] font-mono-tabular text-sm font-semibold ${
                                  isSelected
                                    ? 'text-[var(--kws-accent)]'
                                    : 'text-[var(--kws-muted)] group-hover:text-[var(--kws-ink)]'
                                }`}
                              >
                                {OPTION_LETTERS[idx]}.
                              </span>
                              <span className="text-[var(--kws-ink)]">
                                {opt.label}
                              </span>
                            </div>

                            {isSelected && (
                              <CheckCircle2
                                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--kws-accent)]"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Conditional "Other (please specify)" input */}
                  {selectedOption?.requiresOtherText && (
                    <div className="mt-4">
                      <label
                        htmlFor="kws-other-text"
                        className="block text-sm font-semibold text-[var(--kws-ink)]"
                      >
                        Please specify{' '}
                        <span className="text-[var(--kws-danger)]">*</span>
                      </label>
                      <input
                        id="kws-other-text"
                        type="text"
                        value={answers.otherText[question.id] ?? ''}
                        onChange={(e) =>
                          onChangeOtherText(question.id, e.target.value)
                        }
                        placeholder="Enter your response"
                        className="mt-1.5 w-full rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-3.5 py-2.5 text-base text-[var(--kws-ink)] focus:border-[var(--kws-accent)]"
                      />
                    </div>
                  )}

                  {/* Conditional Institution input for students / recent graduates */}
                  {selectedOption?.requiresInstitution && (
                    <div className="mt-4">
                      <label
                        htmlFor="kws-institution"
                        className="block text-sm font-semibold text-[var(--kws-ink)]"
                      >
                        Exact name of the institution you attend or most
                        recently attended{' '}
                        <span className="text-[var(--kws-danger)]">*</span>
                      </label>
                      <input
                        id="kws-institution"
                        type="text"
                        value={answers.contact.institution}
                        onChange={(e) =>
                          onUpdateContact({ institution: e.target.value })
                        }
                        placeholder="e.g. University of Lagos"
                        className="mt-1.5 w-full rounded-lg border border-[var(--kws-border-strong)] bg-[var(--kws-surface)] px-3.5 py-2.5 text-base text-[var(--kws-ink)] focus:border-[var(--kws-accent)]"
                      />
                    </div>
                  )}

                  {/* Submission Error Alert */}
                  {submitError && (
                    <div
                      role="alert"
                      className="mt-5 flex items-start gap-3 rounded-lg border border-[var(--kws-danger)]/40 bg-[var(--kws-danger-surface)] p-3.5 text-sm text-[var(--kws-danger)]"
                    >
                      <AlertCircle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-semibold">
                          Unable to submit assessment
                        </p>
                        <p className="mt-0.5">{submitError}</p>
                      </div>
                    </div>
                  )}

                  {/* Navigation Controls */}
                  <div className="mt-7 flex items-center justify-between gap-4 border-t border-[var(--kws-border)] pt-5">
                    <Button
                      variant="secondary"
                      onClick={handleBack}
                      disabled={isSubmitting}
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      {stepIndex === 0 ? 'Overview' : 'Back'}
                    </Button>

                    <Button
                      variant="primary"
                      onClick={handleNextQuestion}
                      disabled={
                        question.kind !== 'contact_details' && !canProceed
                      }
                      loading={isSubmitting}
                    >
                      {isLastStep
                        ? isSubmitting
                          ? 'Submitting...'
                          : 'Submit & Continue'
                        : 'Continue'}
                      {!isSubmitting && (
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </Surface>
              );
            })()
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
