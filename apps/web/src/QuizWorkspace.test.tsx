import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicQuizResponse } from '@quiz/shared';
import { QuizWorkspace } from './QuizWorkspace';

const stored: PublicQuizResponse = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  title: 'Сохранённый квиз',
  description: 'Описание из БД',
  category: '',
  createdAt: '2026-11-17T00:00:00Z',
  questions: [
    {
      id: 'q1',
      type: 'single',
      text: 'Первый сохранённый вопрос',
      options: [
        { id: 'a', text: 'Первый вариант' },
        { id: 'b', text: 'Второй вариант' },
      ],
      timeLimitSeconds: 30,
      maxPoints: 1000,
    },
    {
      id: 'q2',
      type: 'multiple',
      text: 'Второй сохранённый вопрос',
      options: [
        { id: 'x', text: 'X' },
        { id: 'y', text: 'Y' },
      ],
      timeLimitSeconds: 5,
      maxPoints: 2000,
    },
  ],
};
function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
function editor() {
  render(<QuizWorkspace />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Создать и посмотреть квиз' }),
  );
}
function fill() {
  fireEvent.change(screen.getByLabelText('Название квиза'), {
    target: { value: '  Мой квиз  ' },
  });
  fireEvent.change(screen.getByLabelText('Описание квиза'), {
    target: { value: ' Описание ' },
  });
  fireEvent.change(screen.getByLabelText('Текст вопроса 1'), {
    target: { value: ' Вопрос? ' },
  });
  for (let i = 1; i <= 4; i++)
    fireEvent.change(screen.getByLabelText(`Вариант ${i} вопроса 1`), {
      target: { value: ` Ответ ${i} ` },
    });
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('QuizWorkspace', () => {
  it('keeps the demo available and switches back', () => {
    editor();
    fireEvent.click(screen.getByRole('button', { name: 'Демопрохождение' }));
    expect(
      screen.getByRole('button', { name: 'Отправить ответ' }),
    ).toBeInTheDocument();
  });
  it('shows shared validation errors and makes no request', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    editor();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить квиз' }));
    expect(screen.getByRole('alert')).toHaveTextContent('questions[0].text');
    expect(screen.getByRole('alert')).toHaveTextContent('REQUIRED');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('prepares normalized typed POST, shows ID, then reads public GET', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(stored, 201))
      .mockResolvedValueOnce(response(stored));
    vi.stubGlobal('fetch', fetch);
    editor();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить квиз' }));
    await screen.findByText('Идентификатор сохранённого квиза');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/quizzes');
    expect(init.method).toBe('POST');
    const input = JSON.parse(init.body);
    expect(input.title).toBe('Мой квиз');
    expect(input.description).toBe('Описание');
    expect(input.questions[0]).toMatchObject({
      text: 'Вопрос?',
      type: 'single',
      timeLimitSeconds: 30,
      maxPoints: 1000,
    });
    expect(
      input.questions[0].options.map((o: { text: string }) => o.text),
    ).toEqual(['Ответ 1', 'Ответ 2', 'Ответ 3', 'Ответ 4']);
    expect(
      input.questions[0].options.map(
        (o: { isCorrect: boolean }) => o.isCorrect,
      ),
    ).toEqual([true, false, false, false]);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Получить квиз' }));
    const article = await screen.findByRole('article', {
      name: 'Публичный просмотр квиза',
    });
    expect(fetch.mock.calls[1][0]).toBe(`/api/quizzes/${stored.id}`);
    expect(article).toHaveTextContent('Описание из БД');
    expect(
      within(article)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual([
      'Сохранённый квиз',
      'Первый сохранённый вопрос',
      'Второй сохранённый вопрос',
    ]);
    expect(
      within(article)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(
      expect.arrayContaining(['Первый вариант', 'Второй вариант', 'X', 'Y']),
    );
    expect(within(article).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(article).queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('does not render leaked extra correctness fields in public view', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          ...stored,
          secret: 'SECRET',
          questions: stored.questions.map((q) => ({
            ...q,
            isCorrect: true,
            options: q.options.map((o) => ({
              ...o,
              isCorrect: true,
              explanation: 'SECRET',
            })),
          })),
        }),
      ),
    );
    editor();
    fireEvent.change(screen.getByLabelText('Идентификатор квиза'), {
      target: { value: stored.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Получить квиз' }));
    const article = await screen.findByRole('article');
    expect(article).not.toHaveTextContent(/SECRET|isCorrect|Правильный/);
  });
  it('adds, reorders and deletes questions without changing option IDs/order', async () => {
    const fetch = vi.fn().mockResolvedValue(response(stored, 201));
    vi.stubGlobal('fetch', fetch);
    editor();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить вопрос' }));
    fireEvent.change(screen.getByLabelText('Текст вопроса 2'), {
      target: { value: 'Второй?' },
    });
    fireEvent.change(screen.getByLabelText('Тип вопроса 2'), {
      target: { value: 'multiple' },
    });
    for (let i = 1; i <= 4; i++)
      fireEvent.change(screen.getByLabelText(`Вариант ${i} вопроса 2`), {
        target: { value: `B${i}` },
      });
    fireEvent.click(screen.getByLabelText('Вопрос 2, вариант 2: правильный'));
    fireEvent.click(screen.getByRole('button', { name: 'Вопрос 2: выше' }));
    expect(screen.getByLabelText('Текст вопроса 1')).toHaveValue('Второй?');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить вопрос' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить вопрос 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить квиз' }));
    await screen.findByText('Идентификатор сохранённого квиза');
    const questions = JSON.parse(fetch.mock.calls[0][1].body).questions;
    expect(questions.map((q: { text: string }) => q.text)).toEqual([
      'Второй?',
      'Вопрос?',
    ]);
    expect(questions[0].options.map((o: { text: string }) => o.text)).toEqual([
      'B1',
      'B2',
      'B3',
      'B4',
    ]);
    expect(
      new Set(questions[0].options.map((o: { id: string }) => o.id)).size,
    ).toBe(4);
    expect(
      questions[0].options.filter((o: { isCorrect: boolean }) => o.isCorrect),
    ).toHaveLength(2);
  });
  it('switches single correctness exclusively and limits option removal/addition', () => {
    editor();
    fireEvent.click(screen.getByLabelText('Вопрос 1, вариант 2: правильный'));
    expect(
      screen.getByLabelText('Вопрос 1, вариант 1: правильный'),
    ).not.toBeChecked();
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить вариант 4 вопроса 1' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить вариант 3 вопроса 1' }),
    );
    expect(
      screen.getByRole('button', { name: 'Удалить вариант 1 вопроса 1' }),
    ).toBeDisabled();
    for (let i = 0; i < 4; i++)
      fireEvent.click(
        screen.getByRole('button', { name: 'Добавить вариант в вопрос 1' }),
      );
    expect(
      screen.getByRole('button', { name: 'Добавить вариант в вопрос 1' }),
    ).toBeDisabled();
  });
  it('blocks multiple submits while pending and after success', async () => {
    let resolve!: (r: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    editor();
    fill();
    const button = screen.getByRole('button', { name: 'Сохранить квиз' });
    const form = button.closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    resolve(response(stored, 201));
    await screen.findByText('Идентификатор сохранённого квиза');
    fireEvent.submit(form);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('shows server validation field, code and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            code: 'INVALID_QUIZ',
            errors: [
              {
                code: 'INVALID_VALUE',
                field: 'title',
                message: 'Недопустимый Unicode',
              },
            ],
          },
          400,
        ),
      ),
    );
    editor();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить квиз' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'title: Недопустимый Unicode (INVALID_VALUE)',
    );
    expect(
      screen.getByRole('button', { name: 'Сохранить квиз' }),
    ).toBeEnabled();
  });
  it.each([503, 413])('shows API error %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, status)));
    editor();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить квиз' }));
    await screen.findByText(status === 413 ? /100 KiB/ : /временно недоступен/);
  });
  it('shows network failure and warns about unknown creation outcome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );
    editor();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить квиз' }));
    await screen.findByText(/Сервер недоступен/);
    expect(
      screen.getByText(/результат сохранения может быть неизвестен/),
    ).toBeInTheDocument();
  });
  it('shows missing quiz error and clears previous public view', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(stored))
      .mockResolvedValueOnce(response({}, 404));
    vi.stubGlobal('fetch', fetch);
    editor();
    const input = screen.getByLabelText('Идентификатор квиза');
    fireEvent.change(input, { target: { value: stored.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Получить квиз' }));
    await screen.findByRole('article');
    fireEvent.change(input, { target: { value: 'other' } });
    fireEvent.click(screen.getByRole('button', { name: 'Получить квиз' }));
    await screen.findByText('Квиз не найден.');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('rejects malformed successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ id: 'wrong' })),
    );
    editor();
    fireEvent.change(screen.getByLabelText('Идентификатор квиза'), {
      target: { value: 'id' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Получить квиз' }));
    await screen.findByText('Ответ сервера не соответствует контракту квиза.');
  });
  it('can start a new draft only explicitly after saving', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(stored, 201)));
    editor();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить квиз' }));
    await screen.findByText('Идентификатор сохранённого квиза');
    fireEvent.click(
      screen.getByRole('button', { name: 'Создать другой квиз' }),
    );
    expect(screen.getByLabelText('Название квиза')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Сохранить квиз' }),
    ).toBeEnabled();
  });
  it('ignores late response after mode switch', async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      ),
    );
    editor();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить квиз' }));
    fireEvent.click(screen.getByRole('button', { name: 'Демопрохождение' }));
    resolve(response(stored, 201));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Отправить ответ' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText('Идентификатор сохранённого квиза'),
    ).not.toBeInTheDocument();
  });
  it.each(['', '   ', undefined, 'bad-id'])(
    'damaged POST id %# keeps draft editable and permits only explicit retry',
    async (id) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(response({ ...stored, id }, 201))
        .mockResolvedValueOnce(response(stored, 201));
      vi.stubGlobal('fetch', fetch);
      editor();
      fill();
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить квиз' }));
      await screen.findByText(
        /Сервер мог сохранить квиз, но подтвердить результат не удалось/,
      );
      expect(
        screen.queryByText('Идентификатор сохранённого квиза'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Создать другой квиз' }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Название квиза')).toHaveValue(
        '  Мой квиз  ',
      );
      const button = screen.getByRole('button', { name: 'Сохранить квиз' });
      expect(button).toBeEnabled();
      expect(fetch).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByLabelText('Название квиза'), {
        target: { value: 'Исправленный квиз' },
      });
      fireEvent.submit(button.closest('form')!);
      fireEvent.submit(button.closest('form')!);
      await screen.findByText('Идентификатор сохранённого квиза');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetch.mock.calls[1][1].body).title).toBe(
        'Исправленный квиз',
      );
    },
  );
});
