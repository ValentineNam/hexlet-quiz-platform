import { describe, expect, it } from 'vitest';
import {
  validateQuestion,
  type Question,
  type ValidationErrorCode,
  type ValidationField,
} from './index';

function question(overrides: Partial<Question> = {}): Question {
  return {
    type: 'single',
    text: 'Столица Франции?',
    options: [
      { id: 'paris', text: 'Париж', isCorrect: true },
      { id: 'rome', text: 'Рим', isCorrect: false },
    ],
    timeLimitSeconds: 30,
    maxPoints: 1000,
    ...overrides,
  };
}

function expectError(
  input: unknown,
  code: ValidationErrorCode,
  field: ValidationField,
) {
  const result = validateQuestion(input);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected validation failure');
  expect(result.errors).toContainEqual({
    code,
    field,
    message: expect.any(String),
  });
  for (const error of result.errors)
    expect(error.message.trim().length).toBeGreaterThan(0);
  return result.errors;
}

describe('validateQuestion', () => {
  it('accepts single choice', () => {
    const input = question();
    expect(validateQuestion(input)).toEqual({ success: true, data: input });
  });

  it('accepts multiple choice with all options correct', () => {
    const input = question({ type: 'multiple' });
    input.options[1].isCorrect = true;
    expect(validateQuestion(input)).toEqual({ success: true, data: input });
  });

  it('accepts multiple choice with two correct answers among three options', () => {
    const input = question({ type: 'multiple' });
    input.options[1].isCorrect = true;
    input.options.push({ id: 'berlin', text: 'Берлин', isCorrect: false });
    expect(validateQuestion(input)).toEqual({ success: true, data: input });
  });

  it('reports missing fields without inserting editor defaults', () => {
    const errors = expectError({}, 'INVALID_QUESTION_TYPE', 'type');
    expect(errors.map(({ code, field }) => ({ code, field }))).toEqual([
      { code: 'INVALID_QUESTION_TYPE', field: 'type' },
      { code: 'REQUIRED', field: 'text' },
      { code: 'INVALID_TYPE', field: 'timeLimitSeconds' },
      { code: 'INVALID_TYPE', field: 'maxPoints' },
      { code: 'INVALID_TYPE', field: 'options' },
    ]);
  });

  it('normalizes text, image and option strings and strips unknown properties', () => {
    const result = validateQuestion({
      ...question(),
      text: '  Вопрос\n ',
      image: ' image-id ',
      extra: 'ignored',
      options: [
        { id: ' a ', text: ' Да ', isCorrect: true, extra: 1 },
        { id: 'b', text: ' Нет ', isCorrect: false },
      ],
    });
    expect(result).toEqual({
      success: true,
      data: question({
        text: 'Вопрос',
        image: 'image-id',
        options: [
          { id: 'a', text: 'Да', isCorrect: true },
          { id: 'b', text: 'Нет', isCorrect: false },
        ],
      }),
    });
  });

  it.each([undefined, '', ' \n\t '])('rejects missing content: %s', (text) => {
    expectError({ ...question(), text }, 'REQUIRED', 'text');
  });

  it.each([undefined, '', '   '])(
    'accepts image-only content with text %s',
    (text) => {
      const result = validateQuestion({
        ...question(),
        text,
        image: ' image-id ',
      });
      expect(result).toEqual({
        success: true,
        data: question({ text: '', image: 'image-id' }),
      });
    },
  );

  it('omits an empty image from normalized output', () => {
    expect(validateQuestion(question({ image: '  ' }))).toEqual({
      success: true,
      data: question(),
    });
  });

  it.each([0, 1, 7])('rejects %i options', (count) => {
    const options = Array.from({ length: count }, (_, i) => ({
      id: String(i),
      text: 'Ответ',
      isCorrect: i === 0,
    }));
    expect(validateQuestion(question({ options }))).toEqual({
      success: false,
      errors: [
        {
          code: 'OPTION_COUNT',
          field: 'options',
          message: 'Требуется от 2 до 6 вариантов ответа.',
        },
      ],
    });
  });

  it('returns only the count error for 10,000 malformed options', () => {
    const options = Array.from({ length: 10_000 }, () => ({
      id: '',
      text: '',
      isCorrect: false,
    }));
    expect(validateQuestion(question({ options }))).toEqual({
      success: false,
      errors: [
        {
          code: 'OPTION_COUNT',
          field: 'options',
          message: 'Требуется от 2 до 6 вариантов ответа.',
        },
      ],
    });
  });

  it('returns only the count error for a sparse array of length 10,000', () => {
    const options: unknown[] = new Array(10_000);
    expect(validateQuestion({ ...question(), options })).toEqual({
      success: false,
      errors: [
        {
          code: 'OPTION_COUNT',
          field: 'options',
          message: 'Требуется от 2 до 6 вариантов ответа.',
        },
      ],
    });
  });

  it('preserves independent field errors when the option count is invalid', () => {
    expect(
      validateQuestion(question({ timeLimitSeconds: 4, options: [] })),
    ).toEqual({
      success: false,
      errors: [
        {
          code: 'OUT_OF_RANGE',
          field: 'timeLimitSeconds',
          message: 'Значение должно быть от 5 до 120 включительно.',
        },
        {
          code: 'OPTION_COUNT',
          field: 'options',
          message: 'Требуется от 2 до 6 вариантов ответа.',
        },
      ],
    });
  });

  it.each([2, 6])('accepts boundary option count %i', (count) => {
    const input = question({
      options: Array.from({ length: count }, (_, i) => ({
        id: String(i),
        text: 'Ответ',
        isCorrect: i === 0,
      })),
    });
    expect(validateQuestion(input)).toEqual({ success: true, data: input });
  });

  it.each(['', ' \t '])('rejects empty option text %s', (text) => {
    const input = question();
    input.options[0].text = text;
    expect(validateQuestion(input)).toEqual({
      success: false,
      errors: [
        {
          code: 'REQUIRED',
          field: 'options[0].text',
          message: 'Строка не должна быть пустой.',
        },
      ],
    });
  });

  it('rejects duplicates after trimming and reports the later id', () => {
    const input = question();
    input.options[1].id = ' paris ';
    expect(validateQuestion(input)).toEqual({
      success: false,
      errors: [
        {
          code: 'DUPLICATE_OPTION_ID',
          field: 'options[1].id',
          message: 'Идентификатор варианта должен быть уникальным.',
        },
      ],
    });
  });

  it('keeps ids case sensitive', () => {
    const input = question();
    input.options[1].id = 'PARIS';
    expect(validateQuestion(input)).toEqual({ success: true, data: input });
  });

  it.each(['single', 'multiple'] as const)(
    'rejects no correct options for %s',
    (type) => {
      const input = question({ type });
      input.options[0].isCorrect = false;
      expectError(input, 'CORRECT_OPTION_COUNT', 'options');
    },
  );

  it('rejects several correct options for single', () => {
    const input = question();
    input.options[1].isCorrect = true;
    expectError(input, 'CORRECT_OPTION_COUNT', 'options');
  });

  it('rejects one correct option for multiple', () => {
    expectError(
      question({ type: 'multiple' }),
      'CORRECT_OPTION_COUNT',
      'options',
    );
  });

  it.each([
    ['timeLimitSeconds', 4, false],
    ['timeLimitSeconds', 5, true],
    ['timeLimitSeconds', 120, true],
    ['timeLimitSeconds', 121, false],
    ['maxPoints', 99, false],
    ['maxPoints', 100, true],
    ['maxPoints', 2000, true],
    ['maxPoints', 2001, false],
  ] as const)('validates %s=%i (valid=%s)', (field, value, valid) => {
    const input = question({ [field]: value });
    if (valid)
      expect(validateQuestion(input)).toEqual({ success: true, data: input });
    else expectError(input, 'OUT_OF_RANGE', field);
  });

  describe.each(['timeLimitSeconds', 'maxPoints'] as const)(
    '%s numeric boundary',
    (field) => {
      it.each([5.5, NaN, Infinity, -Infinity])(
        'rejects noninteger/nonfinite %s',
        (value) => {
          expectError({ ...question(), [field]: value }, 'NOT_INTEGER', field);
        },
      );
      it.each([undefined, null, '30', true, {}, []])(
        'does not coerce %s',
        (value) => {
          expectError({ ...question(), [field]: value }, 'INVALID_TYPE', field);
        },
      );
    },
  );

  it.each([
    null,
    undefined,
    'question',
    1,
    true,
    [],
    () => 1,
    Symbol('question'),
  ])('rejects nonobject input %s', (input) => {
    const errors = expectError(input, 'INVALID_TYPE', '$');
    expect(errors).toHaveLength(1);
  });

  it.each([undefined, null, 1, '', 'other'])(
    'rejects question type %s',
    (type) => {
      expectError({ ...question(), type }, 'INVALID_QUESTION_TYPE', 'type');
    },
  );

  it.each(['text', 'image'] as const)(
    'rejects invalid %s even when other content is present',
    (field) => {
      expectError(
        { ...question({ image: 'image-id' }), [field]: 1 },
        'INVALID_TYPE',
        field,
      );
    },
  );

  it.each([undefined, null, {}, 'options'])(
    'rejects nonarray options %s',
    (options) => {
      expectError({ ...question(), options }, 'INVALID_TYPE', 'options');
    },
  );

  it.each([null, undefined, 'answer', [], 1])(
    'rejects malformed option %s',
    (option) => {
      expectError(
        { ...question(), options: [option, question().options[1]] },
        'INVALID_TYPE',
        'options[0]',
      );
    },
  );

  it('rejects a sparse options array', () => {
    const options: unknown[] = new Array(2);
    options[1] = question().options[1];
    expectError({ ...question(), options }, 'INVALID_TYPE', 'options[0]');
  });

  it.each([
    ['id', undefined, 'INVALID_TYPE'],
    ['id', 1, 'INVALID_TYPE'],
    ['id', ' ', 'REQUIRED'],
    ['text', undefined, 'INVALID_TYPE'],
    ['text', false, 'INVALID_TYPE'],
    ['isCorrect', undefined, 'INVALID_TYPE'],
    ['isCorrect', 'true', 'INVALID_TYPE'],
    ['isCorrect', 1, 'INVALID_TYPE'],
  ] as const)('validates option %s=%s', (field, value, code) => {
    const input = {
      ...question(),
      options: [
        { ...question().options[0], [field]: value },
        question().options[1],
      ],
    };
    expectError(input, code, `options[0].${field}`);
  });

  it('collects independent errors in one result', () => {
    const errors = expectError(
      {
        ...question(),
        type: 'other',
        text: '',
        timeLimitSeconds: 4,
        maxPoints: 99,
      },
      'INVALID_QUESTION_TYPE',
      'type',
    );
    expect(errors.map(({ code, field }) => ({ code, field }))).toEqual([
      { code: 'INVALID_QUESTION_TYPE', field: 'type' },
      { code: 'REQUIRED', field: 'text' },
      { code: 'OUT_OF_RANGE', field: 'timeLimitSeconds' },
      { code: 'OUT_OF_RANGE', field: 'maxPoints' },
    ]);
  });

  it('does not add a misleading correct-count error when correctness is malformed', () => {
    const input = question({ type: 'multiple' });
    const errors = expectError(
      {
        ...input,
        options: [{ ...input.options[0], isCorrect: 'true' }, input.options[1]],
      },
      'INVALID_TYPE',
      'options[0].isCorrect',
    );
    expect(errors.some(({ code }) => code === 'CORRECT_OPTION_COUNT')).toBe(
      false,
    );
  });

  it('does not mutate frozen input and returns detached objects deterministically', () => {
    const input = question({ text: '  Вопрос  ' });
    const before = structuredClone(input);
    input.options.forEach(Object.freeze);
    Object.freeze(input.options);
    Object.freeze(input);
    const result = validateQuestion(input);
    expect(input).toEqual(before);
    expect(result).toEqual(validateQuestion(input));
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected success');
    expect(result.data).not.toBe(input);
    expect(result.data.options).not.toBe(input.options);
    expect(result.data.options[0]).not.toBe(input.options[0]);
    result.data.options[0].text = 'Изменённый результат';
    expect(input).toEqual(before);
  });

  it('does not mutate invalid input', () => {
    const input = question({ timeLimitSeconds: 4 });
    const before = structuredClone(input);
    expectError(input, 'OUT_OF_RANGE', 'timeLimitSeconds');
    expect(input).toEqual(before);
  });
});

describe('option ID length limit agreed after scoring audit', () => {
  it.each(['a'.repeat(256), '😀'.repeat(128)])(
    'accepts 256 UTF-16 units',
    (id) => {
      const input = question();
      input.options[0].id = id;
      expect(validateQuestion(input)).toEqual({ success: true, data: input });
    },
  );
  it.each(['a'.repeat(257), '😀'.repeat(129), ' ' + 'a'.repeat(255) + ' '])(
    'rejects raw ID length over 256 before trim',
    (id) => {
      const input = question();
      input.options[0].id = id;
      expect(validateQuestion(input)).toEqual({
        success: false,
        errors: [
          {
            code: 'OUT_OF_RANGE',
            field: 'options[0].id',
            message:
              'Идентификатор должен содержать не более 256 кодовых единиц UTF-16.',
          },
        ],
      });
      expect(input.options[0].id).toBe(id);
    },
  );
});
