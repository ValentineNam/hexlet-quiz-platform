import {
  validateQuestion,
  MAX_OPTION_ID_LENGTH,
  type Question,
  type ValidationError,
} from './question-validation';

export type AnswerScoringErrorCode =
  | 'INVALID_QUESTION'
  | 'INVALID_SELECTION'
  | 'INVALID_MAX_POINTS'
  | 'INVALID_DURATION'
  | 'INVALID_ELAPSED';

export type AnswerScoringField =
  | 'question'
  | 'selectedOptionIds'
  | `selectedOptionIds[${number}]`
  | 'maxPoints'
  | 'durationMs'
  | 'elapsedMs';

/** Invalid arguments are programming/input errors, never an ordinary wrong answer. */
export class AnswerScoringError extends TypeError {
  constructor(
    public readonly code: AnswerScoringErrorCode,
    public readonly field: AnswerScoringField,
    message: string,
    public readonly questionErrors?: readonly ValidationError[],
  ) {
    super(message);
    this.name = 'AnswerScoringError';
  }
}

export type ScoreResult =
  | { status: 'scored'; score: number }
  | { status: 'late'; score: 0 };

export type AnswerEvaluation =
  | { status: 'accepted'; isCorrect: boolean; score: number }
  | { status: 'late'; score: 0 };

function requireQuestion(input: unknown): Question {
  const result = validateQuestion(input);
  if (!result.success) {
    throw new AnswerScoringError(
      'INVALID_QUESTION',
      'question',
      'Некорректные параметры вопроса.',
      result.errors,
    );
  }
  return result.data;
}

function requireSelectionArray(input: unknown): unknown[] {
  if (!Array.isArray(input)) {
    throw new AnswerScoringError(
      'INVALID_SELECTION',
      'selectedOptionIds',
      'Ответ должен быть массивом строковых идентификаторов.',
    );
  }
  if (input.length > 100) {
    throw new AnswerScoringError(
      'INVALID_SELECTION',
      'selectedOptionIds',
      'Ответ должен содержать не более 100 идентификаторов.',
    );
  }
  return input;
}

function selectedIds(input: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (let index = 0; index < input.length; index += 1) {
    const id: unknown = input[index];
    if (typeof id !== 'string') {
      throw new AnswerScoringError(
        'INVALID_SELECTION',
        `selectedOptionIds[${index}]`,
        'Идентификатор должен быть непустой строкой.',
      );
    }
    if (id.length > MAX_OPTION_ID_LENGTH) {
      throw new AnswerScoringError(
        'INVALID_SELECTION',
        `selectedOptionIds[${index}]`,
        `Идентификатор должен содержать не более ${MAX_OPTION_ID_LENGTH} кодовых единиц UTF-16.`,
      );
    }
    if (!id.trim()) {
      throw new AnswerScoringError(
        'INVALID_SELECTION',
        `selectedOptionIds[${index}]`,
        'Идентификатор должен быть непустой строкой.',
      );
    }
    if (!ids.has(id) && ids.size === 6) {
      throw new AnswerScoringError(
        'INVALID_SELECTION',
        `selectedOptionIds[${index}]`,
        'Ответ должен содержать не более 6 уникальных идентификаторов.',
      );
    }
    // Identity is exact: do not trim or change case in participant selections.
    ids.add(id);
  }
  return ids;
}

function requireElapsed(elapsedMs: unknown): asserts elapsedMs is number {
  if (
    typeof elapsedMs !== 'number' ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0
  ) {
    throw new AnswerScoringError(
      'INVALID_ELAPSED',
      'elapsedMs',
      'Прошедшее время должно быть конечным неотрицательным числом миллисекунд.',
    );
  }
}

/** Exact rational value of a finite nonnegative binary64 number. */
function elapsedFraction(value: number): readonly [bigint, bigint] {
  if (Number.isInteger(value)) return [BigInt(value), 1n];
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  const mantissa =
    (bits & ((1n << 52n) - 1n)) | (exponentBits === 0 ? 0n : 1n << 52n);
  const exponent = exponentBits === 0 ? -1074 : exponentBits - 1023 - 52;
  return exponent >= 0
    ? [mantissa << BigInt(exponent), 1n]
    : [mantissa, 1n << BigInt(-exponent)];
}

function exactScore(
  maxPoints: number,
  durationMs: number,
  elapsedMs: number,
): number {
  // durationMs is a multiple of 1000, so durationMs / 5 is an exact integer.
  if (elapsedMs <= durationMs / 5) return maxPoints;
  const [elapsedNumerator, elapsedDenominator] = elapsedFraction(elapsedMs);
  const duration = BigInt(durationMs);
  // P * (9D - 5t) / (8D), algebraically identical after the 20% plateau.
  const numerator =
    BigInt(maxPoints) *
    (9n * duration * elapsedDenominator - 5n * elapsedNumerator);
  const denominator = 8n * duration * elapsedDenominator;
  // Round a nonnegative rational to nearest integer, exact halves upward.
  return Number((2n * numerator + denominator) / (2n * denominator));
}

function matchesCorrectOptions(
  question: Question,
  selected: Set<string>,
): boolean {
  const correct = question.options.filter((option) => option.isCorrect);
  return (
    selected.size === correct.length &&
    correct.every((option) => selected.has(option.id))
  );
}

/** No timing decision; both single and multiple require exact set equality. */
export function checkAnswer(
  question: unknown,
  selectedOptionIds: unknown,
): boolean {
  return matchesCorrectOptions(
    requireQuestion(question),
    selectedIds(requireSelectionArray(selectedOptionIds)),
  );
}

/** Calculates the score for a correct answer only; elapsedMs must come from the server. */
export function calculateScore(
  maxPoints: unknown,
  durationMs: unknown,
  elapsedMs: unknown,
): ScoreResult {
  if (
    typeof maxPoints !== 'number' ||
    !Number.isInteger(maxPoints) ||
    maxPoints < 100 ||
    maxPoints > 2000
  ) {
    throw new AnswerScoringError(
      'INVALID_MAX_POINTS',
      'maxPoints',
      'Максимальный балл должен быть целым числом от 100 до 2000.',
    );
  }
  if (
    typeof durationMs !== 'number' ||
    !Number.isInteger(durationMs) ||
    durationMs < 5000 ||
    durationMs > 120000 ||
    durationMs % 1000 !== 0
  ) {
    throw new AnswerScoringError(
      'INVALID_DURATION',
      'durationMs',
      'Длительность должна составлять от 5 до 120 целых секунд в миллисекундах.',
    );
  }
  requireElapsed(elapsedMs);
  if (elapsedMs > durationMs) return { status: 'late', score: 0 };
  const score = exactScore(maxPoints, durationMs, elapsedMs);
  return { status: 'scored', score };
}

/** Validates arguments before deciding whether an answer is late or incorrect. */
export function evaluateAnswer(
  question: unknown,
  selectedOptionIds: unknown,
  elapsedMs: unknown,
): AnswerEvaluation {
  const validated = requireQuestion(question);
  const selection = requireSelectionArray(selectedOptionIds);
  requireElapsed(elapsedMs);
  // Even late answers must satisfy bounded argument validation.
  const selected = selectedIds(selection);
  const durationMs = validated.timeLimitSeconds * 1000;
  if (elapsedMs > durationMs) return { status: 'late', score: 0 };
  const isCorrect = matchesCorrectOptions(validated, selected);
  return {
    status: 'accepted',
    isCorrect,
    score: isCorrect
      ? exactScore(validated.maxPoints, durationMs, elapsedMs)
      : 0,
  };
}
