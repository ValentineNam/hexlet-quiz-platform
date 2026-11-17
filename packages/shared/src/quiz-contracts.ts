import type {
  AnswerOption,
  Question,
  ValidationErrorCode,
} from './question-validation';

/** Authoring input, never a participant payload. Contains correct answers. */
export interface CreateQuizRequest {
  title: string;
  description?: string;
  category?: string;
  questions: Question[];
}

/** Explicit whitelist: no isCorrect, answer keys, or authoring explanation. */
export type PublicQuestion = Pick<
  Question,
  'type' | 'text' | 'image' | 'timeLimitSeconds' | 'maxPoints'
> & {
  id: string;
  options: Pick<AnswerOption, 'id' | 'text'>[];
};

export interface PublicQuizResponse {
  id: string;
  title: string;
  description: string;
  category: string;
  createdAt: string;
  questions: PublicQuestion[];
}

export interface QuizInputError {
  code: ValidationErrorCode | 'INVALID_COUNT' | 'TOO_LONG' | 'INVALID_VALUE';
  field: string;
  message: string;
}

export interface QuizValidationErrorResponse {
  code: 'INVALID_QUIZ';
  errors: QuizInputError[];
}
