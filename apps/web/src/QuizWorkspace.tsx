import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PublicQuizResponse, QuizInputError } from '@quiz/shared';
import { App } from './App';
import { createQuiz, getQuiz, QuizApiError } from './quiz-api';
import { newQuestion, prepareDraft, type DraftQuestion } from './quiz-draft';
import './workspace.css';

function QuizEditor() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => [
    newQuestion(),
  ]);
  const [errors, setErrors] = useState<QuizInputError[]>([]);
  const [message, setMessage] = useState('');
  const [savedId, setSavedId] = useState('');
  const [lookup, setLookup] = useState('');
  const [quiz, setQuiz] = useState<PublicQuizResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const hasSaved = useRef(false);
  const mounted = useRef(true);
  const errorPanel = useRef<HTMLDivElement>(null);
  const publicPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (errors.length) errorPanel.current?.focus();
  }, [errors]);
  useEffect(() => {
    if (quiz) publicPanel.current?.focus();
  }, [quiz]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function update(key: string, patch: Partial<DraftQuestion>) {
    setQuestions((current) =>
      current.map((q) => (q.key === key ? { ...q, ...patch } : q)),
    );
  }
  function move(index: number, direction: number) {
    setQuestions((current) => {
      const copy = [...current];
      const target = index + direction;
      if (target < 0 || target >= copy.length) return current;
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }
  function failure(error: unknown) {
    setMessage(
      error instanceof QuizApiError
        ? error.message
        : 'Не удалось выполнить запрос.',
    );
    setErrors(error instanceof QuizApiError ? error.errors : []);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked.current || hasSaved.current) return;
    const result = prepareDraft(title, description, questions);
    setMessage('');
    setErrors([]);
    setQuiz(null);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    locked.current = true;
    setBusy(true);
    try {
      const saved = await createQuiz(result.data);
      if (mounted.current) {
        hasSaved.current = true;
        setSavedId(saved.id);
        setLookup(saved.id);
        setMessage(
          'Квиз сохранён. Нажмите «Получить квиз», чтобы прочитать данные из БД.',
        );
      }
    } catch (error) {
      if (mounted.current) failure(error);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function load(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !lookup.trim()) return;
    locked.current = true;
    setBusy(true);
    setQuiz(null);
    setErrors([]);
    setMessage('');
    try {
      const loaded = await getQuiz(lookup);
      if (mounted.current) setQuiz(loaded);
    } catch (error) {
      if (mounted.current) failure(error);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <header className="workspace-intro">
        <span className="eyebrow">Локальная интеграция · ПМ02</span>
        <h1>Создайте свой квиз</h1>
        <p>
          Составьте вопросы, сохраните квиз и проверьте его публичное
          представление.
        </p>
        <p className="local-notice">
          Без авторизации. Только для локальной работы. Сохранённый квиз здесь
          нельзя проходить как серверную игру.
        </p>
      </header>
      <div className="workspace-columns">
        <section aria-labelledby="editor-title">
          <h2 id="editor-title">Редактор квиза</h2>
          <form onSubmit={save} noValidate>
            <fieldset
              disabled={busy || Boolean(savedId)}
              className="editor-fields"
            >
              <label>
                Название квиза
                <input
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Описание квиза
                <textarea
                  value={description}
                  maxLength={2000}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              {questions.map((q, index) => (
                <fieldset className="editor-question" key={q.key}>
                  <legend>Вопрос {index + 1}</legend>
                  <div className="editor-actions">
                    <button
                      type="button"
                      aria-label={`Вопрос ${index + 1}: выше`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑ Выше
                    </button>
                    <button
                      type="button"
                      aria-label={`Вопрос ${index + 1}: ниже`}
                      disabled={index === questions.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓ Ниже
                    </button>
                    <button
                      type="button"
                      aria-label={`Удалить вопрос ${index + 1}`}
                      onClick={() =>
                        setQuestions((current) =>
                          current.filter((item) => item.key !== q.key),
                        )
                      }
                    >
                      Удалить
                    </button>
                  </div>
                  <label>
                    Текст вопроса {index + 1}
                    <textarea
                      value={q.text}
                      onChange={(e) => update(q.key, { text: e.target.value })}
                    />
                  </label>
                  <label>
                    Тип вопроса {index + 1}
                    <select
                      value={q.type}
                      onChange={(e) => {
                        const type =
                          e.target.value === 'multiple' ? 'multiple' : 'single';
                        const first = q.options.findIndex((o) => o.isCorrect);
                        update(q.key, {
                          type,
                          options:
                            type === 'single'
                              ? q.options.map((o, i) => ({
                                  ...o,
                                  isCorrect: i === first,
                                }))
                              : q.options,
                        });
                      }}
                    >
                      <option value="single">Один правильный ответ</option>
                      <option value="multiple">
                        Несколько правильных ответов
                      </option>
                    </select>
                  </label>
                  <p className="editor-hint">
                    {q.type === 'single'
                      ? 'Отметьте один правильный вариант.'
                      : 'Отметьте минимум два правильных варианта.'}{' '}
                    От 2 до 6 вариантов; порядок сохраняется.
                  </p>
                  {q.options.map((option, optionIndex) => (
                    <div className="editor-option" key={option.id}>
                      <label className="correct-choice">
                        <input
                          type={q.type === 'single' ? 'radio' : 'checkbox'}
                          name={`correct-${q.key}`}
                          checked={option.isCorrect}
                          onChange={(e) =>
                            update(q.key, {
                              options: q.options.map((o) => ({
                                ...o,
                                isCorrect:
                                  q.type === 'single'
                                    ? o.id === option.id
                                    : o.id === option.id
                                      ? e.target.checked
                                      : o.isCorrect,
                              })),
                            })
                          }
                          aria-label={`Вопрос ${index + 1}, вариант ${optionIndex + 1}: правильный`}
                        />
                        <span>Правильный</span>
                      </label>
                      <label>
                        Вариант {optionIndex + 1} вопроса {index + 1}
                        <input
                          value={option.text}
                          onChange={(e) =>
                            update(q.key, {
                              options: q.options.map((o) =>
                                o.id === option.id
                                  ? { ...o, text: e.target.value }
                                  : o,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        aria-label={`Удалить вариант ${optionIndex + 1} вопроса ${index + 1}`}
                        disabled={q.options.length <= 2}
                        onClick={() =>
                          update(q.key, {
                            options: q.options.filter(
                              (o) => o.id !== option.id,
                            ),
                          })
                        }
                      >
                        Удалить вариант
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={q.options.length >= 6}
                    onClick={() =>
                      update(q.key, {
                        options: [
                          ...q.options,
                          {
                            id: crypto.randomUUID(),
                            text: '',
                            isCorrect: false,
                          },
                        ],
                      })
                    }
                  >
                    Добавить вариант в вопрос {index + 1}
                  </button>
                  <div className="editor-numbers">
                    <label>
                      Таймер вопроса {index + 1}, сек
                      <input
                        type="number"
                        min={5}
                        max={120}
                        step={1}
                        value={q.timeLimitSeconds}
                        onChange={(e) =>
                          update(q.key, { timeLimitSeconds: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Баллы вопроса {index + 1}
                      <input
                        type="number"
                        min={100}
                        max={2000}
                        step={1}
                        value={q.maxPoints}
                        onChange={(e) =>
                          update(q.key, { maxPoints: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </fieldset>
              ))}
              <button
                type="button"
                onClick={() =>
                  setQuestions((current) => [...current, newQuestion()])
                }
              >
                Добавить вопрос
              </button>
              <button className="primary-button" type="submit">
                {busy
                  ? 'Запрос выполняется…'
                  : savedId
                    ? 'Квиз уже сохранён'
                    : 'Сохранить квиз'}
              </button>
            </fieldset>
          </form>
          {savedId && (
            <div className="saved-id" role="status">
              <strong>Идентификатор сохранённого квиза</strong>
              <p>{savedId}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setTitle('');
                  setDescription('');
                  setQuestions([newQuestion()]);
                  hasSaved.current = false;
                  setSavedId('');
                  setErrors([]);
                  setMessage('');
                }}
              >
                Создать другой квиз
              </button>
            </div>
          )}
        </section>
        <section aria-labelledby="viewer-title" className="quiz-viewer">
          <h2 id="viewer-title">Сохранённый квиз</h2>
          <p>
            Просмотр по идентификатору. Правильные ответы здесь не отображаются.
          </p>
          <form onSubmit={load}>
            <label>
              Идентификатор квиза
              <input
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <button type="submit" disabled={busy || !lookup.trim()}>
              Получить квиз
            </button>
          </form>
          <div aria-live="polite" aria-atomic="true">
            {busy && <p>Запрос выполняется…</p>}
            {message && <p>{message}</p>}
          </div>
          {errors.length > 0 && (
            <div role="alert" tabIndex={-1} ref={errorPanel}>
              <h3>Проверьте данные</h3>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>
                    <strong>{e.field}</strong>: {e.message} ({e.code})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {quiz && (
            <article
              ref={publicPanel}
              tabIndex={-1}
              className="public-quiz"
              aria-label="Публичный просмотр квиза"
            >
              <h3>{quiz.title}</h3>
              <p>{quiz.description}</p>
              <p>Идентификатор: {quiz.id}</p>
              <ol>
                {quiz.questions.map((q) => (
                  <li key={q.id}>
                    <h3>{q.text || 'Вопрос с изображением'}</h3>
                    {q.image && <p>Изображение: {q.image}</p>}
                    <p>
                      {q.type === 'single'
                        ? 'Один вариант'
                        : 'Несколько вариантов'}{' '}
                      · {q.timeLimitSeconds} сек · до {q.maxPoints} баллов
                    </p>
                    <ol>
                      {q.options.map((o) => (
                        <li key={o.id}>{o.text}</li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            </article>
          )}
        </section>
      </div>
    </main>
  );
}
export function QuizWorkspace() {
  const [mode, setMode] = useState<'demo' | 'editor'>('demo');
  return (
    <>
      <nav className="mode-nav" aria-label="Режим приложения">
        <button
          type="button"
          aria-pressed={mode === 'demo'}
          onClick={() => setMode('demo')}
        >
          Демопрохождение
        </button>
        <button
          type="button"
          aria-pressed={mode === 'editor'}
          onClick={() => setMode('editor')}
        >
          Создать и посмотреть квиз
        </button>
      </nav>
      {mode === 'demo' ? <App /> : <QuizEditor />}
    </>
  );
}
