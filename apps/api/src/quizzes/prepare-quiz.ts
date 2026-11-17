import { BadRequestException } from '@nestjs/common';
import {
  validateQuestion,
  type Question,
  type CreateQuizRequest,
  type QuizInputError,
  type QuizValidationErrorResponse,
} from '@quiz/shared';

export type PreparedQuiz = Required<CreateQuizRequest>;

export function prepareQuiz(input: unknown): PreparedQuiz {
  const errors: QuizInputError[] = [];
  function fail(): never {
    const response: QuizValidationErrorResponse = {
      code: 'INVALID_QUIZ',
      errors,
    };
    throw new BadRequestException(response);
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    errors.push({
      code: 'INVALID_TYPE',
      field: '$',
      message: 'Ожидается объект квиза.',
    });
    return fail();
  }
  const record = input as Record<string, unknown>;
  function storageText(value: string, field: string): void {
    // PostgreSQL UTF-8 text cannot store NUL or isolated UTF-16 surrogates.
    if (
      value.includes(String.fromCharCode(0)) ||
      /[\uD800-\uDFFF]/u.test(value)
    ) {
      errors.push({
        code: 'INVALID_VALUE',
        field,
        message: 'Строка должна быть корректным Unicode без нулевого символа.',
      });
    }
  }
  function text(
    field: 'title' | 'description' | 'category',
    limit: number,
    required = false,
  ): string {
    const value = record[field];
    if (value === undefined && !required) return '';
    if (typeof value !== 'string') {
      errors.push({
        code: 'INVALID_TYPE',
        field,
        message: 'Ожидается строка.',
      });
      return '';
    }
    if (value.length > limit) {
      errors.push({
        code: 'TOO_LONG',
        field,
        message: `Допустимо не более ${limit} кодовых единиц UTF-16.`,
      });
      return '';
    }
    storageText(value, field);
    const normalized = value.trim();
    if (required && !normalized)
      errors.push({
        code: 'REQUIRED',
        field,
        message: 'Название не должно быть пустым.',
      });
    return normalized;
  }
  const title = text('title', 200, true);
  const description = text('description', 2000);
  const category = text('category', 100);
  if (!Array.isArray(record.questions) || record.questions.length === 0) {
    errors.push({
      code: 'INVALID_COUNT',
      field: 'questions',
      message: 'Нужен массив хотя бы с одним валидным вопросом.',
    });
    return fail();
  }
  // Reject invalid metadata before traversing questions; the HTTP JSON body is limited to 100 KiB.
  if (errors.length) return fail();
  const questions: Question[] = [];
  for (let i = 0; i < record.questions.length; i += 1) {
    const result = validateQuestion(record.questions[i]);
    if (!result.success) {
      errors.push(
        ...result.errors.map((error) => ({
          ...error,
          field:
            error.field === '$'
              ? `questions[${i}]`
              : `questions[${i}].${error.field}`,
        })),
      );
      return fail();
    }
    const question = result.data;
    storageText(question.text, `questions[${i}].text`);
    if (question.image) storageText(question.image, `questions[${i}].image`);
    question.options.forEach((option, optionIndex) => {
      storageText(option.id, `questions[${i}].options[${optionIndex}].id`);
      storageText(option.text, `questions[${i}].options[${optionIndex}].text`);
    });
    if (errors.length) return fail();
    questions.push(result.data);
  }
  return { title, description, category, questions };
}
