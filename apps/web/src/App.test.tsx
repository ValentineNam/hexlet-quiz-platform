import { StrictMode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as shared from '@quiz/shared';
import { App } from './App';
import { demoQuestions, DEMO_MAX_POINTS } from './demo-quiz';

function choose(name: string, role: 'radio' | 'checkbox' = 'radio') {
  fireEvent.click(screen.getByRole(role, { name }));
}
function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Отправить ответ' }));
}
function next() {
  fireEvent.click(screen.getByRole('button', { name: 'Следующий вопрос' }));
}
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
function firstCorrect() {
  choose('Марс');
  submit();
  next();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('local quiz player', () => {
  it('shows a valid demo quiz with different question types, durations and points', () => {
    for (const { question } of demoQuestions)
      expect(shared.validateQuestion(question).success).toBe(true);
    expect(
      new Set(demoQuestions.map(({ question }) => question.type)).size,
    ).toBe(2);
    expect(
      new Set(demoQuestions.map(({ question }) => question.timeLimitSeconds))
        .size,
    ).toBe(3);
    expect(
      new Set(demoQuestions.map(({ question }) => question.maxPoints)).size,
    ).toBe(3);
    expect(DEMO_MAX_POINTS).toBe(3000);
  });

  it('renders the quiz title, question, choices, timer and progress', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Маленькое путешествие в науку',
      }),
    ).toBeVisible();
    expect(screen.getByText('Локальный деморежим')).toBeVisible();
    expect(screen.getByText('Вопрос 1 из 3')).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(
      screen.getByRole('timer', { name: 'Оставшееся время' }),
    ).toHaveTextContent('30 сек.');
    expect(
      screen.getByRole('progressbar', { name: 'Прогресс таймера' }),
    ).toHaveAttribute('value', '30000');
    expect(
      screen.getByRole('button', { name: 'Отправить ответ' }),
    ).toBeDisabled();
  });

  it('ignores an empty form submission and does not reveal answers', () => {
    const evaluate = vi.spyOn(shared, 'evaluateAnswer');
    render(<App />);
    fireEvent.submit(
      screen.getByRole('button', { name: 'Отправить ответ' }).closest('form')!,
    );
    expect(evaluate).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Правильный')).not.toBeInTheDocument();
  });

  it('single choice replaces the previous selection', () => {
    render(<App />);
    choose('Венера');
    choose('Марс');
    expect(screen.getByRole('radio', { name: 'Венера' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Марс' })).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Отправить ответ' }),
    ).toBeEnabled();
  });

  it('submits through the shared function with actual elapsed time', () => {
    const evaluate = vi.spyOn(shared, 'evaluateAnswer');
    render(<App />);
    advance(12000);
    choose('Марс');
    submit();
    expect(evaluate).toHaveBeenCalledExactlyOnceWith(
      demoQuestions[0].question,
      ['mars'],
      12000,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Верно!');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Получено баллов: 875',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Правильные ответы: Марс',
    );
    expect(screen.getByRole('status')).toHaveTextContent('оксидами железа');
  });

  it('wrong answers get zero and show the correct answer', () => {
    render(<App />);
    choose('Венера');
    submit();
    expect(screen.getByRole('status')).toHaveTextContent('Не совсем так');
    expect(screen.getByRole('status')).toHaveTextContent('Получено баллов: 0');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Правильные ответы: Марс',
    );
  });

  it('blocks repeat submission and selection changes and stops the timer', () => {
    const evaluate = vi.spyOn(shared, 'evaluateAnswer');
    render(<App />);
    choose('Марс');
    submit();
    submit();
    fireEvent.submit(
      screen.getByRole('button', { name: 'Отправить ответ' }).closest('form')!,
    );
    expect(evaluate).toHaveBeenCalledTimes(1);
    for (const radio of screen.getAllByRole('radio'))
      expect(radio).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Отправить ответ' }),
    ).toBeDisabled();
    advance(60000);
    expect(screen.getByRole('status')).toHaveTextContent('Верно!');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows multiple choices and deselection, requiring the exact answer set', () => {
    render(<App />);
    firstCorrect();
    expect(screen.getByText('Вопрос 2 из 3')).toBeVisible();
    expect(screen.getByRole('timer')).toHaveTextContent('20 сек.');
    choose('Дельфин', 'checkbox');
    choose('Акула', 'checkbox');
    choose('Акула', 'checkbox');
    choose('Летучая мышь', 'checkbox');
    expect(screen.getByRole('checkbox', { name: 'Дельфин' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Летучая мышь' }),
    ).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Акула' })).not.toBeChecked();
    submit();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Получено баллов: 1500',
    );
  });

  it('awards no partial credit for multiple choice', () => {
    render(<App />);
    firstCorrect();
    choose('Дельфин', 'checkbox');
    submit();
    expect(screen.getByRole('status')).toHaveTextContent('Получено баллов: 0');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Правильные ответы: Дельфин, Летучая мышь',
    );
  });

  it('expires after the deadline and freezes a selected answer without scoring it', () => {
    const evaluate = vi.spyOn(shared, 'evaluateAnswer');
    render(<App />);
    choose('Марс');
    advance(30100);
    expect(screen.getByRole('status')).toHaveTextContent('Время истекло');
    expect(screen.getByRole('status')).toHaveTextContent('Получено баллов: 0');
    expect(
      screen.getByRole('button', { name: 'Отправить ответ' }),
    ).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Марс/ })).toBeDisabled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0');
    expect(evaluate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the clock when interval callbacks were suspended', () => {
    render(<App />);
    choose('Марс');
    vi.spyOn(performance, 'now').mockReturnValue(30001);
    submit();
    expect(screen.getByRole('status')).toHaveTextContent('Время истекло');
    expect(screen.getByRole('status')).toHaveTextContent('Получено баллов: 0');
  });

  it('also checks the deadline on selection before a delayed interval', () => {
    render(<App />);
    vi.spyOn(performance, 'now').mockReturnValue(30001);
    choose('Марс');
    expect(screen.getByRole('status')).toHaveTextContent('Время истекло');
    expect(screen.getByRole('radio', { name: /Марс/ })).not.toBeChecked();
  });

  it('refreshes from actual elapsed time when a tab becomes visible', () => {
    render(<App />);
    vi.spyOn(performance, 'now').mockReturnValue(17000);
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('timer')).toHaveTextContent('13 сек.');
    vi.spyOn(performance, 'now').mockReturnValue(31000);
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('status')).toHaveTextContent('Время истекло');
  });

  it('starts a fresh timer and clears selection on the next question', () => {
    render(<App />);
    advance(10000);
    choose('Марс');
    submit();
    next();
    expect(screen.getByRole('timer')).toHaveTextContent('20 сек.');
    expect(
      screen
        .getAllByRole('checkbox')
        .every((input) => !(input as HTMLInputElement).checked),
    ).toBe(true);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('shows totals and restarts without carrying score or answers across attempts', () => {
    render(<App />);
    firstCorrect();
    choose('Дельфин', 'checkbox');
    choose('Летучая мышь', 'checkbox');
    submit();
    next();
    choose('Четыре');
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть итоги' }));
    const summary = screen.getByRole('region', {
      name: 'Отличная тренировка!',
    });
    expect(summary).toHaveTextContent('2500 из 3000');
    expect(summary).toHaveTextContent('2 из 3');
    expect(summary).toHaveTextContent('Пройдено вопросов3');
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Начать заново' }));
    expect(screen.getByText('Вопрос 1 из 3')).toBeVisible();
    expect(screen.getByRole('timer')).toHaveTextContent('30 сек.');
    expect(screen.getByRole('radio', { name: 'Марс' })).not.toBeChecked();
    advance(30100);
    next();
    advance(20100);
    next();
    advance(5100);
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть итоги' }));
    expect(
      screen.getByRole('region', { name: 'Отличная тренировка!' }),
    ).toHaveTextContent('0 из 3000');
    expect(
      screen.getByRole('region', { name: 'Отличная тренировка!' }),
    ).toHaveTextContent('0 из 3');
  });

  it('places focus on question and feedback and preserves native form semantics', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
    expect(
      screen.getByRole('group', { name: 'Выберите один ответ' }),
    ).toBeVisible();
    choose('Марс');
    fireEvent.submit(
      screen.getByRole('button', { name: 'Отправить ответ' }).closest('form')!,
    );
    expect(screen.getByRole('status')).toHaveFocus();
    next();
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
  });

  it('cleans timers and listeners on unmount, including React StrictMode', () => {
    const { unmount } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(() =>
      fireEvent(document, new Event('visibilitychange')),
    ).not.toThrow();
  });
});

describe('inclusive deadline regressions', () => {
  it.each([29999, 30000, 30001])(
    'manual submission with suspended interval at %i ms',
    (elapsed) => {
      const evaluate = vi.spyOn(shared, 'evaluateAnswer');
      render(<App />);
      choose('Марс');
      vi.spyOn(performance, 'now').mockReturnValue(elapsed);
      fireEvent.submit(
        screen
          .getByRole('button', { name: 'Отправить ответ' })
          .closest('form')!,
      );
      expect(evaluate).toHaveBeenCalledExactlyOnceWith(
        demoQuestions[0].question,
        ['mars'],
        elapsed,
      );
      const expected = shared.evaluateAnswer(
        demoQuestions[0].question,
        ['mars'],
        elapsed,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        expected.status === 'late' ? 'Время истекло' : 'Верно!',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        `Получено баллов: ${elapsed <= 30000 ? 500 : 0}`,
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([29999, 30000, 30001])(
    'visibility refresh at %i ms uses the same deadline',
    (elapsed) => {
      render(<App />);
      choose('Марс');
      vi.spyOn(performance, 'now').mockReturnValue(elapsed);
      fireEvent(document, new Event('visibilitychange'));
      if (elapsed > 30000) {
        expect(screen.getByRole('status')).toHaveTextContent('Время истекло');
        expect(
          screen.getByRole('button', { name: 'Отправить ответ' }),
        ).toBeDisabled();
      } else {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Отправить ответ' }),
        ).toBeEnabled();
        if (elapsed === 30000) {
          expect(screen.getByRole('timer')).toHaveTextContent('0 сек.');
          expect(
            screen.getByText(/При отправке время проверяется повторно/),
          ).toBeVisible();
        }
        submit();
        expect(screen.getByRole('status')).toHaveTextContent(
          'Получено баллов: 500',
        );
      }
    },
  );

  it('an interval at exactly the deadline does not close the form', () => {
    render(<App />);
    choose('Марс');
    advance(30000);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Марс' })).toBeEnabled();
    expect(screen.getByRole('timer')).toHaveTextContent('0 сек.');
    submit();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Получено баллов: 500',
    );
    advance(1000);
    expect(screen.getByRole('status')).toHaveTextContent('Верно!');
  });

  it.each(['refresh-first', 'submit-first'])(
    'race at exact deadline: %s',
    (order) => {
      const evaluate = vi.spyOn(shared, 'evaluateAnswer');
      render(<App />);
      choose('Марс');
      const form = screen
        .getByRole('button', { name: 'Отправить ответ' })
        .closest('form')!;
      const clock = vi.spyOn(performance, 'now').mockReturnValue(30000);
      act(() => {
        const refresh = () =>
          document.dispatchEvent(new Event('visibilitychange'));
        const send = () =>
          form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
          );
        if (order === 'refresh-first') {
          refresh();
          send();
        } else {
          send();
          refresh();
        }
        send();
        clock.mockReturnValue(30001);
        refresh();
        send();
      });
      expect(evaluate).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent(
        'Получено баллов: 500',
      );
      expect(screen.getByRole('status')).toHaveTextContent('Верно!');
      next();
      expect(screen.getByText('Вопрос 2 из 3')).toBeVisible();
    },
  );

  it('automatic late completion wins against a subsequent manual submit', () => {
    const evaluate = vi.spyOn(shared, 'evaluateAnswer');
    render(<App />);
    choose('Марс');
    const form = screen
      .getByRole('button', { name: 'Отправить ответ' })
      .closest('form')!;
    vi.spyOn(performance, 'now').mockReturnValue(30001);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Время истекло');
    expect(screen.getByRole('status')).toHaveTextContent('Получено баллов: 0');
  });

  it('selection is allowed at the exact deadline and blocked immediately after it', () => {
    render(<App />);
    const clock = vi.spyOn(performance, 'now').mockReturnValue(30000);
    choose('Марс');
    expect(screen.getByRole('radio', { name: 'Марс' })).toBeChecked();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    clock.mockReturnValue(30001);
    choose('Венера');
    expect(screen.getByRole('status')).toHaveTextContent('Время истекло');
    expect(screen.getByRole('radio', { name: /Венера/ })).not.toBeChecked();
  });
});

describe('visibility listener cleanup identity', () => {
  it.each([false, true])(
    'removes each registered listener, StrictMode=%s',
    (strict) => {
      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      const { unmount } = render(
        strict ? (
          <StrictMode>
            <App />
          </StrictMode>
        ) : (
          <App />
        ),
      );
      const registrations = add.mock.calls.filter(
        ([event]) => event === 'visibilitychange',
      );
      expect(registrations).toHaveLength(strict ? 2 : 1);
      expect(
        remove.mock.calls.filter(([event]) => event === 'visibilitychange'),
      ).toHaveLength(strict ? 1 : 0);
      unmount();
      const removals = remove.mock.calls.filter(
        ([event]) => event === 'visibilitychange',
      );
      expect(removals).toHaveLength(registrations.length);
      registrations.forEach(([, handler], index) => {
        expect(removals[index][1]).toBe(handler);
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
