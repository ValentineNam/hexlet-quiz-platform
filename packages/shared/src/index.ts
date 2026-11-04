export const PROJECT_NAME = 'Quiz Platform';

export { validateQuestion, MAX_OPTION_ID_LENGTH } from './question-validation';
export type {
  QuestionType,
  AnswerOption,
  Question,
  ValidationErrorCode,
  ValidationField,
  ValidationError,
  ValidationResult,
} from './question-validation';

export {
  checkAnswer,
  calculateScore,
  evaluateAnswer,
  AnswerScoringError,
} from './answer-scoring';
export type {
  AnswerScoringErrorCode,
  AnswerScoringField,
  ScoreResult,
  AnswerEvaluation,
} from './answer-scoring';
