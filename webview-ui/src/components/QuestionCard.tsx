/**
 * QuestionCard - Shows a question prompt with text input or choice options
 */

import React, { useState } from 'react';
import type { Question } from '../types/opencode';
import { postMessage } from '../utils/vscodeApi';
import { useChatStore } from '../stores/chatStore';

interface QuestionCardProps {
  question: Question;
}

export function QuestionCard({ question }: QuestionCardProps) {
  const [answer, setAnswer] = useState('');
  const setQuestionState = useChatStore((s) => s.setQuestion);

  const handleSubmit = (value: string) => {
    if (!value.trim()) return;
    postMessage({
      type: 'question:respond',
      data: { id: question.id, answer: value.trim() },
    });
    setQuestionState(undefined);
  };

  return (
    <div className="question-card">
      <div className="question-card__header">
        <span className="question-card__icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm1.5-4.5c-.5.5-1 .7-1 1.5H7c0-1.3.8-2 1.5-2.5C9 6 9.5 5.5 9.5 5 9.5 4.2 8.8 3.5 8 3.5S6.5 4.2 6.5 5H5c0-1.7 1.3-3 3-3s3 1.3 3 3c0 1.2-.8 1.8-1.5 2.5z" />
          </svg>
        </span>
        <span className="question-card__title">Question</span>
      </div>

      <div className="question-card__body">
        <p className="question-card__text">{question.text}</p>

        {question.type === 'choice' && question.options ? (
          <div className="question-card__options">
            {question.options.map((option, index) => (
              <button
                key={index}
                className="question-card__option-btn"
                onClick={() => handleSubmit(option)}
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <div className="question-card__input-row">
            <input
              type="text"
              className="question-card__input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(answer);
                }
              }}
              placeholder="Type your answer..."
              autoFocus
            />
            <button
              className="question-card__submit-btn"
              onClick={() => handleSubmit(answer)}
              disabled={!answer.trim()}
            >
              Submit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
