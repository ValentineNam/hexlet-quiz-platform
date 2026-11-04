/** Input for authoring/validation, not a participant-facing payload: includes correct answers. */
export type QuestionType = 'single' | 'multiple';

export interface AnswerOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  type: QuestionType;
  text: string;
  image?: string;
  options: AnswerOption[];
  timeLimitSeconds: number;
  maxPoints: number;
}

export type ValidationErrorCode =
  | 'INVALID_TYPE'
  | 'REQUIRED'
  | 'INVALID_QUESTION_TYPE'
  | 'OPTION_COUNT'
  | 'DUPLICATE_OPTION_ID'
  | 'CORRECT_OPTION_COUNT'
  | 'NOT_INTEGER'
  | 'OUT_OF_RANGE';

export type ValidationField =
  | '$'
  | 'type'
  | 'text'
  | 'image'
  | 'options'
  | 'timeLimitSeconds'
  | 'maxPoints'
  | `options[${number}]`
  | `options[${number}].id`
  | `options[${number}].text`
  | `options[${number}].isCorrect`;

export interface ValidationError {
  code: ValidationErrorCode;
  field: ValidationField;
  message: string;
}

export type ValidationResult =
  | { success: true; data: Question }
  | { success: false; errors: ValidationError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates data values without coercion, I/O or mutation. */
export function validateQuestion(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const addError = (
    code: ValidationErrorCode,
    field: ValidationField,
    message: string,
  ) => {
    errors.push({ code, field, message });
  };

  if (!isRecord(input)) {
    return {
      success: false,
      errors: [
        {
          code: 'INVALID_TYPE',
          field: '$',
          message: 'Вопрос должен быть объектом.',
        },
      ],
    };
  }

  const type = input.type;
  if (type !== 'single' && type !== 'multiple') {
    addError(
      'INVALID_QUESTION_TYPE',
      'type',
      'Тип вопроса должен быть single или multiple.',
    );
  }

  function optionalText(value: unknown, field: 'text' | 'image'): string {
    if (value === undefined) return '';
    if (typeof value !== 'string') {
      addError('INVALID_TYPE', field, 'Ожидается строка.');
      return '';
    }
    return value.trim();
  }
  const text = optionalText(input.text, 'text');
  const image = optionalText(input.image, 'image');
  if (!text && !image) {
    addError('REQUIRED', 'text', 'Добавьте текст вопроса или изображение.');
  }

  function integer(
    value: unknown,
    field: 'timeLimitSeconds' | 'maxPoints',
    min: number,
    max: number,
  ): number | undefined {
    if (typeof value !== 'number') {
      addError('INVALID_TYPE', field, 'Ожидается число.');
    } else if (!Number.isInteger(value)) {
      addError('NOT_INTEGER', field, 'Ожидается конечное целое число.');
    } else if (value < min || value > max) {
      addError(
        'OUT_OF_RANGE',
        field,
        `Значение должно быть от ${min} до ${max} включительно.`,
      );
    } else {
      return value;
    }
    return undefined;
  }
  const timeLimitSeconds = integer(
    input.timeLimitSeconds,
    'timeLimitSeconds',
    5,
    120,
  );
  const maxPoints = integer(input.maxPoints, 'maxPoints', 100, 2000);

  const options: AnswerOption[] = [];
  if (!Array.isArray(input.options)) {
    addError(
      'INVALID_TYPE',
      'options',
      'Варианты ответа должны быть массивом.',
    );
  } else if (input.options.length < 2 || input.options.length > 6) {
    // Do not inspect elements or count correct answers in an invalid-size array.
    addError(
      'OPTION_COUNT',
      'options',
      'Требуется от 2 до 6 вариантов ответа.',
    );
  } else {
    const ids = new Set<string>();
    let correctCount = 0;
    let canCountCorrect = true;
    // Indexed iteration deliberately validates holes in sparse arrays as invalid options.
    for (let index = 0; index < input.options.length; index += 1) {
      const option: unknown = input.options[index];
      if (!isRecord(option)) {
        addError(
          'INVALID_TYPE',
          `options[${index}]`,
          'Вариант ответа должен быть объектом.',
        );
        canCountCorrect = false;
        continue;
      }
      function requiredText(value: unknown, field: ValidationField): string {
        if (typeof value !== 'string') {
          addError('INVALID_TYPE', field, 'Ожидается строка.');
          return '';
        }
        const normalized = value.trim();
        if (!normalized)
          addError('REQUIRED', field, 'Строка не должна быть пустой.');
        return normalized;
      }
      const id = requiredText(option.id, `options[${index}].id`);
      const optionText = requiredText(option.text, `options[${index}].text`);
      if (id) {
        if (ids.has(id))
          addError(
            'DUPLICATE_OPTION_ID',
            `options[${index}].id`,
            'Идентификатор варианта должен быть уникальным.',
          );
        ids.add(id);
      }
      const isCorrect = option.isCorrect;
      if (typeof isCorrect !== 'boolean') {
        addError(
          'INVALID_TYPE',
          `options[${index}].isCorrect`,
          'Признак правильности должен быть boolean.',
        );
        canCountCorrect = false;
      } else {
        if (isCorrect) correctCount += 1;
        options.push({ id, text: optionText, isCorrect });
      }
    }
    if (
      canCountCorrect &&
      ((type === 'single' && correctCount !== 1) ||
        (type === 'multiple' && correctCount < 2))
    ) {
      addError(
        'CORRECT_OPTION_COUNT',
        'options',
        type === 'single'
          ? 'Для single нужен ровно один правильный вариант.'
          : 'Для multiple нужны минимум два правильных варианта.',
      );
    }
  }

  if (
    errors.length > 0 ||
    (type !== 'single' && type !== 'multiple') ||
    timeLimitSeconds === undefined ||
    maxPoints === undefined
  ) {
    return { success: false, errors };
  }
  return {
    success: true,
    data: {
      type,
      text,
      ...(image ? { image } : {}),
      options,
      timeLimitSeconds,
      maxPoints,
    },
  };
}
