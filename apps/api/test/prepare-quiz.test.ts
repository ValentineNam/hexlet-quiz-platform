import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { prepareQuiz } from '../src/quizzes/prepare-quiz';

import { quizInput } from './quiz.fixture';
function errors(input: unknown) {
  try {
    prepareQuiz(input);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    if (!(error instanceof BadRequestException)) throw error;
    return error.getResponse();
  }
  throw new Error('Expected invalid input');
}
describe('prepareQuiz', () => {
  it('normalizes with shared validation and detaches frozen input', () => {
    const input = quizInput();
    const before = structuredClone(input);
    input.questions[0].options.forEach(Object.freeze);
    Object.freeze(input.questions[0].options);
    Object.freeze(input.questions[0]);
    Object.freeze(input.questions);
    Object.freeze(input);
    const prepared = prepareQuiz(input);
    expect(prepared.title).toBe('Проверка API');
    expect(prepared.questions[0].options[0]).toEqual({
      id: 'a',
      text: 'Да',
      isCorrect: true,
    });
    expect(prepared.questions).not.toBe(input.questions);
    expect(input).toEqual(before);
  });
  it.each([null, undefined, [], 1, 'quiz'].map((input) => ({ input })))(
    'rejects nonobject $input',
    ({ input }) => {
      expect(errors(input)).toMatchObject({
        code: 'INVALID_QUIZ',
        errors: [{ code: 'INVALID_TYPE', field: '$' }],
      });
    },
  );
  it.each([
    ['title', '', 'REQUIRED'],
    ['title', 1, 'INVALID_TYPE'],
    ['title', 'a'.repeat(201), 'TOO_LONG'],
    ['description', null, 'INVALID_TYPE'],
    ['description', 'a'.repeat(2001), 'TOO_LONG'],
    ['category', 'a'.repeat(101), 'TOO_LONG'],
  ])('rejects invalid %s', (field, value, code) => {
    expect(errors({ ...quizInput(), [String(field)]: value })).toMatchObject({
      code: 'INVALID_QUIZ',
      errors: [{ code, field }],
    });
  });
  it.each([[], null, undefined].map((questions) => ({ questions })))(
    'rejects missing questions $questions',
    ({ questions }) => {
      expect(errors({ ...quizInput(), questions })).toMatchObject({
        errors: [{ code: 'INVALID_COUNT', field: 'questions' }],
      });
    },
  );
  it.each(['\0', '\uD800'])(
    'rejects text unsupported by PostgreSQL before writing: %#',
    (invalid) => {
      expect(errors({ ...quizInput(), title: 'bad' + invalid })).toMatchObject({
        errors: [{ code: 'INVALID_VALUE', field: 'title' }],
      });
      const input = quizInput();
      input.questions[0].options[0].text = 'bad' + invalid;
      expect(errors(input)).toMatchObject({
        errors: [
          { code: 'INVALID_VALUE', field: 'questions[0].options[0].text' },
        ],
      });
    },
  );
  it('accepts exact metadata length boundaries', () => {
    const result = prepareQuiz({
      ...quizInput(),
      title: 'a'.repeat(200),
      description: 'a'.repeat(2000),
      category: 'a'.repeat(100),
    });
    expect(result.title).toHaveLength(200);
    expect(result.description).toHaveLength(2000);
    expect(result.category).toHaveLength(100);
  });
  it('reports shared error paths including a duplicate ID', () => {
    const input = quizInput();
    input.questions[0].options[1].id = 'a';
    expect(errors(input)).toMatchObject({
      code: 'INVALID_QUIZ',
      errors: [
        { code: 'DUPLICATE_OPTION_ID', field: 'questions[0].options[1].id' },
      ],
    });
  });
  it('validates sparse arrays and prefixes root paths', () => {
    expect(errors({ ...quizInput(), questions: new Array(2) })).toMatchObject({
      errors: [{ code: 'INVALID_TYPE', field: 'questions[0]' }],
    });
  });
  it('accepts image-only and multiple questions with safe normalized defaults', () => {
    const input = quizInput();
    input.questions[0].type = 'multiple';
    input.questions[0].options[1].isCorrect = true;
    const prepared = prepareQuiz({
      title: 'demo',
      questions: [{ ...input.questions[0], text: '', image: 'image-key' }],
    });
    expect(prepared.description).toBe('');
    expect(prepared.category).toBe('');
    expect(prepared.questions[0].image).toBe('image-key');
  });
});
