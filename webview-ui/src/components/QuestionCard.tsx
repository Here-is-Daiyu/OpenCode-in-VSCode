/**
 * QuestionCard - Shows one or more structured questions
 */

import React, { useEffect, useState } from 'react';
import type { QuestionInfo, QuestionRequest } from '../types/opencode';
import { postMessage } from '../utils/vscodeApi';

interface QuestionCardProps {
  question: QuestionRequest;
}

function createEmptySelections(question: QuestionRequest): string[][] {
  return question.questions.map(() => []);
}

function createEmptyInputs(question: QuestionRequest): string[] {
  return question.questions.map(() => '');
}

export function QuestionCard({ question }: QuestionCardProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<string[][]>(() => createEmptySelections(question));
  const [inputValues, setInputValues] = useState<string[]>(() => createEmptyInputs(question));

  useEffect(() => {
    setSelectedAnswers(createEmptySelections(question));
    setInputValues(createEmptyInputs(question));
  }, [question]);

  const buildAnswers = (
    nextSelectedAnswers: string[][] = selectedAnswers,
    nextInputValues: string[] = inputValues,
  ): string[][] => question.questions.map((item, index) => {
    const inputValue = nextInputValues[index]?.trim() ?? '';

    if (item.multiple) {
      return nextSelectedAnswers[index] ?? [];
    }

    if (item.options.length === 0) {
      return inputValue ? [inputValue] : [];
    }

    if (item.custom && inputValue) {
      return [inputValue];
    }

    return nextSelectedAnswers[index]?.slice(0, 1) ?? [];
  });

  const canSubmit = (answers: string[][]): boolean => (
    answers.length > 0
    && answers.length === question.questions.length
    && answers.every((answerGroup) => (
      answerGroup.length > 0
      && answerGroup.every((answer) => answer.trim().length > 0)
    ))
  );

  const requiresManualSubmit = question.questions.some(
    (item) => item.multiple || item.custom || item.options.length === 0,
  );

  const submitAnswers = (
    nextSelectedAnswers: string[][] = selectedAnswers,
    nextInputValues: string[] = inputValues,
  ): void => {
    const answers = buildAnswers(nextSelectedAnswers, nextInputValues);
    if (!canSubmit(answers)) {
      return;
    }

    postMessage({
      type: 'question:respond',
      data: { id: question.id, answers },
    });
  };

  const handleSingleOptionSelect = (questionIndex: number, value: string): void => {
    const nextSelectedAnswers = selectedAnswers.map((answers, index) => (
      index === questionIndex ? [value] : answers
    ));
    const nextInputValues = inputValues.map((inputValue, index) => (
      index === questionIndex ? '' : inputValue
    ));

    setSelectedAnswers(nextSelectedAnswers);
    setInputValues(nextInputValues);

    if (!requiresManualSubmit && canSubmit(buildAnswers(nextSelectedAnswers, nextInputValues))) {
      submitAnswers(nextSelectedAnswers, nextInputValues);
    }
  };

  const handleMultipleOptionToggle = (
    item: QuestionInfo,
    questionIndex: number,
    value: string,
  ): void => {
    const currentSelection = new Set(selectedAnswers[questionIndex] ?? []);
    if (currentSelection.has(value)) {
      currentSelection.delete(value);
    } else {
      currentSelection.add(value);
    }

    const nextAnswerGroup = item.options
      .map((option) => option.label)
      .filter((label) => currentSelection.has(label));

    const nextSelectedAnswers = selectedAnswers.map((answers, index) => (
      index === questionIndex ? nextAnswerGroup : answers
    ));

    setSelectedAnswers(nextSelectedAnswers);
  };

  const handleInputChange = (questionIndex: number, value: string): void => {
    const nextInputValues = inputValues.map((inputValue, index) => (
      index === questionIndex ? value : inputValue
    ));
    const nextSelectedAnswers = selectedAnswers.map((answers, index) => (
      index === questionIndex && value.trim().length > 0 ? [] : answers
    ));

    setInputValues(nextInputValues);
    setSelectedAnswers(nextSelectedAnswers);
  };

  const handleInputSubmit = (questionIndex: number): void => {
    const nextInputValues = inputValues.map((inputValue, index) => (
      index === questionIndex ? inputValue.trim() : inputValue
    ));

    setInputValues(nextInputValues);
    submitAnswers(selectedAnswers, nextInputValues);
  };

  const canSubmitCurrentAnswers = canSubmit(buildAnswers());

  return (
    <div className="question-card">
      {question.questions.map((item, index) => {
        const hasOptions = item.options.length > 0;
        const selectedValues = selectedAnswers[index] ?? [];
        const inputValue = inputValues[index] ?? '';
        const showInput = !item.multiple && (!hasOptions || Boolean(item.custom));

        return (
          <section className="question-card__item" key={`${question.id}-${index}`}>
            <strong className="question-card__header">{item.header}</strong>
            <p className="question-card__body">{item.question}</p>

            {hasOptions && (
              <div className="question-card__options">
                {item.options.map((option) => {
                  const isSelected = selectedValues.includes(option.label);

                  return (
                    <button
                      key={option.label}
                      className={[
                        'question-card__option',
                        isSelected ? 'question-card__option--selected' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => (
                        item.multiple
                          ? handleMultipleOptionToggle(item, index, option.label)
                          : handleSingleOptionSelect(index, option.label)
                      )}
                      aria-pressed={isSelected}
                      title={option.description || undefined}
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}

            {showInput && (
              <div className="question-card__controls">
                <input
                  type="text"
                  className="question-card__input"
                  value={inputValue}
                  onChange={(event) => handleInputChange(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleInputSubmit(index);
                    }
                  }}
                  placeholder={hasOptions ? 'Type a custom answer...' : 'Type your answer...'}
                />
                <button
                  className="question-card__submit"
                  onClick={() => handleInputSubmit(index)}
                  disabled={!canSubmitCurrentAnswers}
                  type="button"
                >
                  Submit
                </button>
              </div>
            )}

            {item.multiple && (
              <button
                className="question-card__submit"
                onClick={() => submitAnswers()}
                disabled={!canSubmitCurrentAnswers}
                type="button"
              >
                Submit
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
