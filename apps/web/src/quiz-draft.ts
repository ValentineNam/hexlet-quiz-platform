import {
  validateQuestion,
  type CreateQuizRequest,
  type QuizInputError,
  type QuestionType,
  type AnswerOption,
} from '@quiz/shared';

export interface DraftQuestion {
  key: string;
  text: string;
  type: QuestionType;
  options: AnswerOption[];
  timeLimitSeconds: string;
  maxPoints: string;
}
export function newQuestion(): DraftQuestion {
  return {
    key: crypto.randomUUID(),
    text: '',
    type: 'single',
    options: Array.from({ length: 4 }, (_, i) => ({
      id: crypto.randomUUID(),
      text: '',
      isCorrect: i === 0,
    })),
    timeLimitSeconds: '30',
    maxPoints: '1000',
  };
}
export function prepareDraft(
  title: string,
  description: string,
  draft: DraftQuestion[],
):
  | { success: true; data: CreateQuizRequest }
  | { success: false; errors: QuizInputError[] } {
  const errors: QuizInputError[] = [];
  if (!title.trim())
    errors.push({
      code: 'REQUIRED',
      field: 'title',
      message: 'Введите название квиза.',
    });
  if (draft.length === 0)
    errors.push({
      code: 'INVALID_COUNT',
      field: 'questions',
      message: 'Добавьте хотя бы один вопрос.',
    });
  const questions: CreateQuizRequest['questions'] = [];
  draft.forEach((q, index) => {
    const result = validateQuestion({
      ...q,
      timeLimitSeconds: q.timeLimitSeconds.trim()
        ? Number(q.timeLimitSeconds)
        : NaN,
      maxPoints: q.maxPoints.trim() ? Number(q.maxPoints) : NaN,
    });
    if (result.success) questions.push(result.data);
    else
      errors.push(
        ...result.errors.map((e) => ({
          ...e,
          field:
            e.field === '$'
              ? `questions[${index}]`
              : `questions[${index}].${e.field}`,
        })),
      );
  });
  return errors.length
    ? { success: false, errors }
    : {
        success: true,
        data: {
          title: title.trim(),
          description: description.trim(),
          questions,
        },
      };
}
