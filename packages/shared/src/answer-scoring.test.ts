import { describe, expect, it } from 'vitest';
import {
  checkAnswer,
  calculateScore,
  evaluateAnswer,
  AnswerScoringError,
  type AnswerScoringErrorCode,
  type AnswerScoringField,
  type Question,
} from './index';

function question(overrides: Partial<Question> = {}): Question {
  return {
    type: 'single',
    text: 'Вопрос',
    options: [
      { id: 'a', text: 'А', isCorrect: true },
      { id: 'b', text: 'Б', isCorrect: false },
    ],
    timeLimitSeconds: 30,
    maxPoints: 1000,
    ...overrides,
  };
}
function multiple(): Question {
  return question({
    type: 'multiple',
    options: [
      { id: 'a', text: 'А', isCorrect: true },
      { id: 'b', text: 'Б', isCorrect: true },
      { id: 'c', text: 'В', isCorrect: false },
    ],
  });
}
function expectArgumentError(
  action: () => unknown,
  code: AnswerScoringErrorCode,
  field: AnswerScoringField,
) {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AnswerScoringError);
  if (!(caught instanceof AnswerScoringError))
    throw new Error('Expected AnswerScoringError');
  expect(caught.code).toBe(code);
  expect(caught.field).toBe(field);
  expect(caught.message.trim().length).toBeGreaterThan(0);
  return caught;
}

describe('checkAnswer', () => {
  it.each([
    [['a'], true],
    [['b'], false],
    [[], false],
    [['unknown'], false],
    [['a', 'a'], true],
    [['a', 'b'], false],
    [['a', 'unknown'], false],
    [['A'], false],
    [[' a '], false],
  ] as const)('single selection %j is %s', (selected, expected) => {
    expect(checkAnswer(question(), selected)).toBe(expected);
  });
  it.each([
    [['a', 'b'], true],
    [['b', 'a'], true],
    [['a', 'b', 'a'], true],
    [['a'], false],
    [['a', 'a'], false],
    [[], false],
    [['a', 'c'], false],
    [['a', 'b', 'c'], false],
    [['a', 'b', 'unknown'], false],
  ] as const)('multiple selection %j is %s', (selected, expected) => {
    expect(checkAnswer(multiple(), selected)).toBe(expected);
  });
  it('uses normalized question ids without mutating the question', () => {
    const input = question();
    input.options[0].id = ' a ';
    expect(checkAnswer(input, ['a'])).toBe(true);
    expect(input.options[0].id).toBe(' a ');
  });
  it('accepts all correct options in a multiple question', () => {
    const input = multiple();
    input.options[2].isCorrect = true;
    expect(checkAnswer(input, ['c', 'a', 'b'])).toBe(true);
  });
});

describe('calculateScore', () => {
  it.each([
    [5000, 0, 1000],
    [5000, 1000, 1000],
    [5000, 1001, 1000],
    [5000, 2000, 875],
    [5000, 3000, 750],
    [5000, 4000, 625],
    [5000, 5000, 500],
    [30000, 0, 1000],
    [30000, 6000, 1000],
    [30000, 6001, 1000],
    [30000, 12000, 875],
    [30000, 18000, 750],
    [30000, 24000, 625],
    [30000, 30000, 500],
    [120000, 0, 1000],
    [120000, 24000, 1000],
    [120000, 24001, 1000],
    [120000, 48000, 875],
    [120000, 72000, 750],
    [120000, 96000, 625],
    [120000, 120000, 500],
  ])('duration=%i elapsed=%i yields %i', (duration, elapsed, expected) => {
    expect(calculateScore(1000, duration, elapsed)).toEqual({
      status: 'scored',
      score: expected,
    });
  });
  it.each([5000, 30000, 120000])(
    'distinguishes immediately after the deadline for %i',
    (duration) => {
      expect(calculateScore(1000, duration, duration + 0.001)).toEqual({
        status: 'late',
        score: 0,
      });
    },
  );
  it.each([5000, 30000, 120000])(
    'preserves the plateau before and at 20%% for %i',
    (duration) => {
      for (const elapsed of [
        0,
        0.1 * duration,
        0.2 * duration - 0.001,
        0.2 * duration,
      ]) {
        expect(calculateScore(1000, duration, elapsed)).toEqual({
          status: 'scored',
          score: 1000,
        });
      }
    },
  );
  it.each([100, 101, 1000, 1999, 2000])(
    'rounds half-points upward at the deadline for max=%i',
    (max) => {
      expect(calculateScore(max, 5000, 5000)).toEqual({
        status: 'scored',
        score: Math.round(max / 2),
      });
    },
  );
  it.each([
    [3000, 750],
    [3001, 750],
    [3002, 750],
    [3003, 750],
    [3004, 750],
    [3005, 749],
  ])('rounding at elapsed=%i yields %i', (elapsed, expected) => {
    expect(calculateScore(1000, 5000, elapsed)).toEqual({
      status: 'scored',
      score: expected,
    });
  });
  it('accepts fractional elapsed milliseconds without rounding the time', () => {
    expect(calculateScore(1000, 5000, 3004.1)).toEqual({
      status: 'scored',
      score: 749,
    });
    expect(calculateScore(1000, 5000, 0.125)).toEqual({
      status: 'scored',
      score: 1000,
    });
  });
  describe.each([5000, 30000, 120000])(
    'monotonicity for duration %i',
    (duration) => {
      it.each([100, 101, 1000, 2000])(
        'never increases and stays within bounds, max=%i',
        (max) => {
          let previous = max;
          for (let step = 0; step <= 1000; step += 1) {
            const result = calculateScore(
              max,
              duration,
              duration * (0.2 + (0.8 * step) / 1000),
            );
            expect(result.status).toBe('scored');
            expect(result.score).toBeLessThanOrEqual(previous);
            expect(result.score).toBeGreaterThanOrEqual(Math.round(max * 0.5));
            expect(result.score).toBeLessThanOrEqual(max);
            previous = result.score;
          }
        },
      );
    },
  );
});

describe('evaluateAnswer', () => {
  it.each([
    [0, 1000],
    [6000, 1000],
    [12000, 875],
    [18000, 750],
    [24000, 625],
    [30000, 500],
  ])('scores a correct answer at %i as %i', (elapsed, score) => {
    expect(evaluateAnswer(question(), ['a'], elapsed)).toEqual({
      status: 'accepted',
      isCorrect: true,
      score,
    });
  });
  it.each([0, 6000, 12000, 30000])(
    'scores wrong and empty answers at %i as zero',
    (elapsed) => {
      for (const selected of [[], ['b'], ['unknown']]) {
        expect(evaluateAnswer(question(), selected, elapsed)).toEqual({
          status: 'accepted',
          isCorrect: false,
          score: 0,
        });
      }
    },
  );
  it.each([[], ['a'], ['b'], ['unknown']].map((selected) => ({ selected })))(
    'returns late regardless of selection $selected',
    ({ selected }) => {
      expect(evaluateAnswer(question(), selected, 30001)).toEqual({
        status: 'late',
        score: 0,
      });
    },
  );
  it('gives no partial credit to multiple selection', () => {
    expect(evaluateAnswer(multiple(), ['a'], 12000)).toEqual({
      status: 'accepted',
      isCorrect: false,
      score: 0,
    });
  });
  it('deduplicates and ignores order when scoring multiple selection', () => {
    expect(evaluateAnswer(multiple(), ['b', 'a', 'b'], 12000)).toEqual({
      status: 'accepted',
      isCorrect: true,
      score: 875,
    });
  });
  it.each([5, 120])(
    'supports min/max question values at duration %i seconds',
    (duration) => {
      for (const max of [100, 2000]) {
        const input = question({ timeLimitSeconds: duration, maxPoints: max });
        expect(evaluateAnswer(input, ['a'], 0)).toEqual({
          status: 'accepted',
          isCorrect: true,
          score: max,
        });
        expect(evaluateAnswer(input, ['a'], duration * 1000)).toEqual({
          status: 'accepted',
          isCorrect: true,
          score: max / 2,
        });
      }
    },
  );
  it('does not mutate deeply frozen inputs and produces deterministic results', () => {
    const input = multiple();
    const selected = ['b', 'a', 'b'];
    const snapshot = structuredClone({ input, selected });
    input.options.forEach(Object.freeze);
    Object.freeze(input.options);
    Object.freeze(input);
    Object.freeze(selected);
    const result = evaluateAnswer(input, selected, 12000);
    expect(checkAnswer(input, selected)).toBe(true);
    expect(result).toEqual(evaluateAnswer(input, selected, 12000));
    expect({ input, selected }).toEqual(snapshot);
  });
});

describe('argument errors', () => {
  it.each(
    [
      null,
      undefined,
      [],
      {},
      'question',
      question({ maxPoints: 99 }),
      question({ timeLimitSeconds: 4 }),
      question({ options: [] }),
    ].map((input) => ({ input })),
  )(
    'does not turn malformed question $input into a wrong/late answer',
    ({ input }) => {
      for (const action of [
        () => checkAnswer(input, []),
        () => evaluateAnswer(input, [], 200000),
      ]) {
        const error = expectArgumentError(
          action,
          'INVALID_QUESTION',
          'question',
        );
        expect(error.questionErrors?.length).toBeGreaterThan(0);
      }
    },
  );
  it('propagates existing question validation details', () => {
    const input = question();
    input.options[1].id = 'a';
    const error = expectArgumentError(
      () => evaluateAnswer(input, [], 0),
      'INVALID_QUESTION',
      'question',
    );
    expect(error.questionErrors).toEqual([
      {
        code: 'DUPLICATE_OPTION_ID',
        field: 'options[1].id',
        message: 'Идентификатор варианта должен быть уникальным.',
      },
    ]);
  });
  it.each([null, undefined, {}, 'a', true, 1])(
    'rejects nonarray selection %j',
    (selected) => {
      expectArgumentError(
        () => checkAnswer(question(), selected),
        'INVALID_SELECTION',
        'selectedOptionIds',
      );
      expectArgumentError(
        () => evaluateAnswer(question(), selected, 30001),
        'INVALID_SELECTION',
        'selectedOptionIds',
      );
    },
  );
  it.each(
    [null, undefined, {}, [], true, 1, '', '  '].map((value) => ({ value })),
  )('rejects malformed selection item $value', ({ value }) => {
    expectArgumentError(
      () => checkAnswer(question(), ['a', value]),
      'INVALID_SELECTION',
      'selectedOptionIds[1]',
    );
    expectArgumentError(
      () => evaluateAnswer(question(), ['a', value], 30001),
      'INVALID_SELECTION',
      'selectedOptionIds[1]',
    );
  });
  it('rejects sparse selection arrays', () => {
    expectArgumentError(
      () => evaluateAnswer(question(), new Array(2), 0),
      'INVALID_SELECTION',
      'selectedOptionIds[0]',
    );
  });
  it.each([
    99,
    2001,
    100.5,
    NaN,
    Infinity,
    -Infinity,
    null,
    undefined,
    '1000',
    true,
    {},
  ])('rejects maxPoints %s', (max) => {
    expectArgumentError(
      () => calculateScore(max, 30000, 0),
      'INVALID_MAX_POINTS',
      'maxPoints',
    );
  });
  it.each([
    4999,
    120001,
    5000.5,
    5001,
    NaN,
    Infinity,
    -Infinity,
    null,
    undefined,
    '30000',
    true,
    {},
  ])('rejects durationMs %s', (duration) => {
    expectArgumentError(
      () => calculateScore(1000, duration, 0),
      'INVALID_DURATION',
      'durationMs',
    );
  });
  it.each(
    [
      -1,
      -0.001,
      NaN,
      Infinity,
      -Infinity,
      null,
      undefined,
      '0',
      true,
      {},
      [],
    ].map((elapsed) => ({ elapsed })),
  )('rejects elapsedMs $elapsed even for a wrong answer', ({ elapsed }) => {
    expectArgumentError(
      () => calculateScore(1000, 30000, elapsed),
      'INVALID_ELAPSED',
      'elapsedMs',
    );
    expectArgumentError(
      () => evaluateAnswer(question(), ['b'], elapsed),
      'INVALID_ELAPSED',
      'elapsedMs',
    );
  });
  it('does not mutate input when rejecting invalid arguments', () => {
    const input = question({ maxPoints: 99 });
    const selected = ['a'];
    const before = structuredClone({ input, selected });
    expectArgumentError(
      () => evaluateAnswer(input, selected, 0),
      'INVALID_QUESTION',
      'question',
    );
    expect({ input, selected }).toEqual(before);
  });
});

describe('audit regressions: exact rounding and resource limits', () => {
  it.each([
    [100, 5000, 4400, 58],
    [1000, 30000, 12168, 872],
    [101, 5000, 3000, 76],
    [100, 5000, 1040, 100],
    [1000, 5000, 1004, 1000],
    [2000, 120000, 120000, 1000],
    [1000, 5000, 3004, 750],
    [1000, 5000, 3004.125, 749],
    [1000, 5000, 3003.875, 750],
    [1000, 5000, Number.MIN_VALUE, 1000],
  ])(
    'exact score max=%i duration=%i elapsed=%s is %i',
    (max, duration, elapsed, score) => {
      expect(calculateScore(max, duration, elapsed)).toEqual({
        status: 'scored',
        score,
      });
    },
  );

  it.each([100000, 101])(
    'rejects %i entries before validating elements, also when late',
    (length) => {
      const selected: unknown[] = Array.from({ length }, () => null);
      for (const action of [
        () => checkAnswer(question(), selected),
        () => evaluateAnswer(question(), selected, 30001),
      ]) {
        const error = expectArgumentError(
          action,
          'INVALID_SELECTION',
          'selectedOptionIds',
        );
        expect(error.message).toBe(
          'Ответ должен содержать не более 100 идентификаторов.',
        );
      }
    },
  );

  it('rejects 100000 identical IDs even though the unique count is one', () => {
    const selected = Array.from({ length: 100000 }, () => 'a');
    expectArgumentError(
      () => checkAnswer(question(), selected),
      'INVALID_SELECTION',
      'selectedOptionIds',
    );
    expectArgumentError(
      () => evaluateAnswer(question(), selected, 30001),
      'INVALID_SELECTION',
      'selectedOptionIds',
    );
  });

  it('accepts exactly 100 duplicate IDs', () => {
    const selected = Object.freeze(Array.from({ length: 100 }, () => 'a'));
    expect(checkAnswer(question(), selected)).toBe(true);
    expect(evaluateAnswer(question(), selected, 0)).toEqual({
      status: 'accepted',
      isCorrect: true,
      score: 1000,
    });
    expect(evaluateAnswer(question(), selected, 30001)).toEqual({
      status: 'late',
      score: 0,
    });
  });

  it('rejects the seventh unique ID without treating it as an ordinary wrong answer', () => {
    const selected = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expectArgumentError(
      () => checkAnswer(question(), selected),
      'INVALID_SELECTION',
      'selectedOptionIds[6]',
    );
    expectArgumentError(
      () => evaluateAnswer(question(), selected, 30001),
      'INVALID_SELECTION',
      'selectedOptionIds[6]',
    );
  });

  it('allows six unique IDs, returning wrong if they do not match', () => {
    expect(checkAnswer(question(), ['a', 'b', 'c', 'd', 'e', 'f'])).toBe(false);
  });

  it('preserves every required ID validation for late answers', () => {
    expectArgumentError(
      () => evaluateAnswer(question(), ['a', null], 30001),
      'INVALID_SELECTION',
      'selectedOptionIds[1]',
    );
  });

  it('has deterministic error precedence with simultaneously invalid arguments', () => {
    expectArgumentError(
      () => calculateScore(99, 0, -1),
      'INVALID_MAX_POINTS',
      'maxPoints',
    );
    expectArgumentError(
      () => calculateScore(100, 0, -1),
      'INVALID_DURATION',
      'durationMs',
    );
    expectArgumentError(
      () => evaluateAnswer({}, null, NaN),
      'INVALID_QUESTION',
      'question',
    );
    expectArgumentError(
      () => evaluateAnswer(question(), null, NaN),
      'INVALID_SELECTION',
      'selectedOptionIds',
    );
    expectArgumentError(
      () => evaluateAnswer(question(), new Array(101), NaN),
      'INVALID_SELECTION',
      'selectedOptionIds',
    );
    expectArgumentError(
      () => evaluateAnswer(question(), [null], NaN),
      'INVALID_ELAPSED',
      'elapsedMs',
    );
  });

  it('does not mutate rejected large selections', () => {
    const input = question();
    const selected = Object.freeze(Array.from({ length: 101 }, () => 'a'));
    const before = structuredClone({ input, selected });
    expectArgumentError(
      () => evaluateAnswer(input, selected, 30001),
      'INVALID_SELECTION',
      'selectedOptionIds',
    );
    expect({ input, selected }).toEqual(before);
  });
});

describe('exact fractional half-points', () => {
  it.each([
    [3136.6875, 751],
    [3136.71875, 751],
    [3136.75, 750],
  ])('rounds binary-exact elapsed=%s to %i', (elapsed, score) => {
    // For max=1024, D=5000: at t=3136.71875, the exact score is 750.5.
    expect(calculateScore(1024, 5000, elapsed)).toEqual({
      status: 'scored',
      score,
    });
  });

  it('distinguishes adjacent binary64 values around an exact half-point', () => {
    const t = 3136.71875;
    const ulp = 2 ** -41;
    expect(calculateScore(1024, 5000, t - ulp)).toEqual({
      status: 'scored',
      score: 751,
    });
    expect(calculateScore(1024, 5000, t)).toEqual({
      status: 'scored',
      score: 751,
    });
    expect(calculateScore(1024, 5000, t + ulp)).toEqual({
      status: 'scored',
      score: 750,
    });
  });
});

describe('shared ID length policy', () => {
  it.each(['a'.repeat(256), '😀'.repeat(128)])(
    'accepts an ID of 256 UTF-16 units',
    (id) => {
      const input = question();
      input.options[0].id = id;
      const selected = Object.freeze([id, id]);
      expect(checkAnswer(input, selected)).toBe(true);
      expect(evaluateAnswer(input, selected, 0)).toEqual({
        status: 'accepted',
        isCorrect: true,
        score: 1000,
      });
    },
  );
  it.each([
    'a'.repeat(257),
    '😀'.repeat(129),
    'a'.repeat(100000),
    ' ' + 'a'.repeat(255) + ' ',
  ])('rejects an oversized selection ID, including late answers', (id) => {
    expectArgumentError(
      () => checkAnswer(question(), [id]),
      'INVALID_SELECTION',
      'selectedOptionIds[0]',
    );
    expectArgumentError(
      () => evaluateAnswer(question(), [id], 30001),
      'INVALID_SELECTION',
      'selectedOptionIds[0]',
    );
  });
  it('uses question validation before selection and time errors for oversized question IDs', () => {
    const input = question();
    input.options[0].id = 'a'.repeat(257);
    const error = expectArgumentError(
      () => evaluateAnswer(input, [null], NaN),
      'INVALID_QUESTION',
      'question',
    );
    expect(error.questionErrors).toEqual([
      {
        code: 'OUT_OF_RANGE',
        field: 'options[0].id',
        message:
          'Идентификатор должен содержать не более 256 кодовых единиц UTF-16.',
      },
    ]);
  });
});
