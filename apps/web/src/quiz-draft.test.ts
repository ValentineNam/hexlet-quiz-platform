import { describe, expect, it } from 'vitest';
import { newQuestion, prepareDraft } from './quiz-draft';
function valid() {
  const q = newQuestion();
  q.text = ' Q ';
  q.options = q.options.slice(0, 2).map((o, i) => ({ ...o, text: ` A${i} ` }));
  return q;
}
describe('prepareDraft', () => {
  it('normalizes without mutation or local keys in request', () => {
    const q = valid();
    const before = structuredClone(q);
    const result = prepareDraft(' title ', ' desc ', [q]);
    expect(q).toEqual(before);
    expect(result).toEqual({
      success: true,
      data: {
        title: 'title',
        description: 'desc',
        questions: [
          {
            type: 'single',
            text: 'Q',
            timeLimitSeconds: 30,
            maxPoints: 1000,
            options: q.options.map((o) => ({ ...o, text: o.text.trim() })),
          },
        ],
      },
    });
  });
  it('requires at least one question', () => {
    expect(prepareDraft('quiz', '', [])).toEqual({
      success: false,
      errors: [
        {
          code: 'INVALID_COUNT',
          field: 'questions',
          message: 'Добавьте хотя бы один вопрос.',
        },
      ],
    });
  });
  it.each([
    ['4', '99'],
    ['', ''],
    ['5.5', '100.5'],
  ])('uses shared numeric validation for %s/%s', (seconds, points) => {
    const q = valid();
    q.timeLimitSeconds = seconds;
    q.maxPoints = points;
    const result = prepareDraft('quiz', '', [q]);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected errors');
    expect(result.errors.map((e) => e.field)).toEqual([
      'questions[0].timeLimitSeconds',
      'questions[0].maxPoints',
    ]);
  });
  it('uses shared multiple correctness rules', () => {
    const q = valid();
    q.type = 'multiple';
    const result = prepareDraft('quiz', '', [q]);
    expect(result).toMatchObject({
      success: false,
      errors: [{ code: 'CORRECT_OPTION_COUNT', field: 'questions[0].options' }],
    });
  });
});
