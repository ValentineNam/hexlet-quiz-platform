import { useCallback, useEffect, useRef, useState } from 'react';
import { evaluateAnswer, type Question } from '@quiz/shared';
import { demoQuestions, DEMO_MAX_POINTS, DEMO_QUIZ_TITLE } from './demo-quiz';

type Outcome = { status: 'correct' | 'incorrect' | 'timeout'; score: number };

function QuestionRound({
  question,
  explanation,
  index,
  onNext,
}: {
  question: Question;
  explanation: string;
  index: number;
  onNext: (outcome: Outcome) => void;
}) {
  const durationMs = question.timeLimitSeconds * 1000;
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [selected, setSelected] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const startedAt = useRef(0);
  const settled = useRef(false);
  const interval = useRef<number | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);

  const finish = useCallback(
    (nextOutcome: Outcome, elapsedMs: number) => {
      if (settled.current) return;
      settled.current = true;
      window.clearInterval(interval.current);
      setRemainingMs(Math.max(0, durationMs - elapsedMs));
      setOutcome(nextOutcome);
    },
    [durationMs],
  );

  const expireIfDue = useCallback(
    (elapsedMs: number): boolean => {
      if (elapsedMs <= durationMs) return false;
      finish({ status: 'timeout', score: 0 }, elapsedMs);
      return true;
    },
    [durationMs, finish],
  );

  useEffect(() => {
    heading.current?.focus();
    startedAt.current = performance.now();
    function refresh() {
      if (settled.current) return;
      const elapsedMs = Math.max(0, performance.now() - startedAt.current);
      if (!expireIfDue(elapsedMs)) {
        setRemainingMs(Math.max(0, durationMs - elapsedMs));
      }
    }
    interval.current = window.setInterval(refresh, 100);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval.current);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [durationMs, expireIfDue]);

  useEffect(() => {
    if (outcome) feedback.current?.focus();
  }, [outcome]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settled.current) return;
    const elapsedMs = Math.max(0, performance.now() - startedAt.current);
    // Shared decides whether a selected answer arrived on time, including equality.
    if (selected.length === 0) {
      expireIfDue(elapsedMs);
      return;
    }
    const result = evaluateAnswer(question, selected, elapsedMs);
    finish(
      result.status === 'late'
        ? { status: 'timeout', score: 0 }
        : {
            status: result.isCorrect ? 'correct' : 'incorrect',
            score: result.score,
          },
      elapsedMs,
    );
  }

  return (
    <section className="question-card" aria-labelledby="question-title">
      <div className="question-meta">
        <span>
          Вопрос {index + 1} из {demoQuestions.length}
        </span>
        <span>До {question.maxPoints} баллов</span>
      </div>
      <div
        className={`timer ${remainingMs <= 5000 && !outcome ? 'timer-urgent' : ''}`}
      >
        <div className="timer-label">
          <span>Осталось времени</span>
          <strong role="timer" aria-label="Оставшееся время">
            {Math.ceil(remainingMs / 1000)} сек.
          </strong>
        </div>
        <progress
          aria-label="Прогресс таймера"
          max={durationMs}
          value={remainingMs}
        />
      </div>
      {!outcome && remainingMs === 0 && (
        <p className="selection-hint" aria-live="polite">
          Ровно на дедлайне ответ принимается. При отправке время проверяется
          повторно; после дедлайна — 0 баллов.
        </p>
      )}
      <h2 id="question-title" tabIndex={-1} ref={heading}>
        {question.text}
      </h2>
      <form onSubmit={submit}>
        <fieldset disabled={outcome !== null} aria-describedby="selection-hint">
          <legend>
            {question.type === 'single'
              ? 'Выберите один ответ'
              : 'Выберите все правильные ответы'}
          </legend>
          <p className="selection-hint" id="selection-hint">
            {question.type === 'single'
              ? 'Только один вариант может быть правильным.'
              : 'Для зачёта нужно выбрать точный набор вариантов.'}
          </p>
          <div className="options">
            {question.options.map((option, optionIndex) => (
              <label
                key={option.id}
                className={`option ${selected.includes(option.id) ? 'option-selected' : ''} ${outcome && option.isCorrect ? 'option-correct' : ''}`}
              >
                <input
                  type={question.type === 'single' ? 'radio' : 'checkbox'}
                  name="answer"
                  value={option.id}
                  checked={selected.includes(option.id)}
                  onChange={(event) => {
                    if (
                      settled.current ||
                      expireIfDue(
                        Math.max(0, performance.now() - startedAt.current),
                      )
                    )
                      return;
                    setSelected(
                      question.type === 'single'
                        ? [option.id]
                        : event.target.checked
                          ? [...selected, option.id]
                          : selected.filter((id) => id !== option.id),
                    );
                  }}
                />
                <span className="option-letter" aria-hidden="true">
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span>{option.text}</span>
                {outcome && option.isCorrect && (
                  <span className="correct-tag">Правильный</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
        <button
          className="primary-button"
          type="submit"
          disabled={outcome !== null || selected.length === 0}
        >
          Отправить ответ
        </button>
      </form>
      {outcome && (
        <div
          className={`feedback feedback-${outcome.status}`}
          ref={feedback}
          tabIndex={-1}
          role="status"
          aria-live="polite"
        >
          <h3>
            {outcome.status === 'correct'
              ? 'Верно!'
              : outcome.status === 'timeout'
                ? 'Время истекло'
                : 'Не совсем так'}
          </h3>
          <p className="earned">
            Получено баллов: <strong>{outcome.score}</strong>
          </p>
          <p>
            {outcome.status === 'timeout'
              ? 'Вы не успели отправить ответ. За этот вопрос — 0 баллов.'
              : outcome.status === 'correct'
                ? 'Баллы рассчитаны с учётом времени ответа.'
                : 'За неправильный или неполный ответ баллы не начисляются.'}
          </p>
          <p>
            <strong>Правильные ответы: </strong>
            {question.options
              .filter((option) => option.isCorrect)
              .map((option) => option.text)
              .join(', ')}
            .
          </p>
          <p>{explanation}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => onNext(outcome)}
          >
            {index === demoQuestions.length - 1
              ? 'Посмотреть итоги'
              : 'Следующий вопрос'}
          </button>
        </div>
      )}
    </section>
  );
}

function Summary({
  results,
  onRestart,
}: {
  results: Outcome[];
  onRestart: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const total = results.reduce((sum, item) => sum + item.score, 0);
  return (
    <section className="question-card summary" aria-labelledby="summary-title">
      <span className="eyebrow">Квиз завершён</span>
      <h2 id="summary-title" tabIndex={-1} ref={heading}>
        Отличная тренировка!
      </h2>
      <p>Каждый вопрос — ещё один повод узнать что-то новое.</p>
      <dl className="summary-stats">
        <div>
          <dt>Набрано баллов</dt>
          <dd>
            {total} <span>из {DEMO_MAX_POINTS}</span>
          </dd>
        </div>
        <div>
          <dt>Правильных ответов</dt>
          <dd>
            {results.filter((item) => item.status === 'correct').length}{' '}
            <span>из {demoQuestions.length}</span>
          </dd>
        </div>
        <div>
          <dt>Пройдено вопросов</dt>
          <dd>{results.length}</dd>
        </div>
      </dl>
      <button className="primary-button" type="button" onClick={onRestart}>
        Начать заново
      </button>
    </section>
  );
}

export function App() {
  const [results, setResults] = useState<Outcome[]>([]);
  const [attempt, setAttempt] = useState(0);
  const index = results.length;
  const item = demoQuestions[index];
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#main">
          Quiz Platform
          <span className="brand-dot" aria-hidden="true" />
        </a>
        <span className="demo-badge">Локальный деморежим</span>
      </header>
      <main id="main" className="player-layout">
        <aside className="quiz-intro">
          <p className="eyebrow">Проверим любопытство</p>
          <h1>{DEMO_QUIZ_TITLE}</h1>
          <p>
            Космос, природа и немного логики. Три вопроса — и новые маленькие
            открытия.
          </p>
          <div className="quiz-facts">
            <span>{demoQuestions.length} вопроса</span>
            <span>До {DEMO_MAX_POINTS} баллов</span>
          </div>
          <div className="demo-note">
            <strong>Это тренировка</strong>
            <p>
              Ответы проверяются в браузере. Результаты не сохраняются,
              подключения к игровой комнате нет.
            </p>
          </div>
        </aside>
        {item ? (
          <QuestionRound
            key={`${attempt}-${index}`}
            {...item}
            index={index}
            onNext={(outcome) =>
              setResults((previous) =>
                previous.length === index ? [...previous, outcome] : previous,
              )
            }
          />
        ) : (
          <Summary
            results={results}
            onRestart={() => {
              setResults([]);
              setAttempt((previous) => previous + 1);
            }}
          />
        )}
      </main>
      <footer className="site-footer">
        Учебный проект · ПМ01 <span>Выбирайте. Думайте. Узнавайте.</span>
      </footer>
    </div>
  );
}
