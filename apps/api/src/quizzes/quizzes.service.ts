import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PublicQuizResponse } from '@quiz/shared';
import { PrismaService } from '../database/prisma.service';
import { prepareQuiz } from './prepare-quiz';

const include = {
  questions: {
    orderBy: { position: 'asc' },
    include: { options: { orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.QuizInclude;
type StoredQuiz = Prisma.QuizGetPayload<{ include: typeof include }>;

function publicQuiz(quiz: StoredQuiz): PublicQuizResponse {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category,
    createdAt: quiz.createdAt.toISOString(),
    questions: quiz.questions.map((question) => ({
      id: question.id,
      type: question.type,
      text: question.text,
      ...(question.image ? { image: question.image } : {}),
      timeLimitSeconds: question.timeLimitSeconds,
      maxPoints: question.maxPoints,
      options: question.options.map((option) => ({
        id: option.key,
        text: option.text,
      })),
    })),
  };
}

@Injectable()
export class QuizzesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(input: unknown): Promise<PublicQuizResponse> {
    const prepared = prepareQuiz(input);
    try {
      const quiz = await this.prisma.quiz.create({
        data: {
          title: prepared.title,
          description: prepared.description,
          category: prepared.category,
          questions: {
            create: prepared.questions.map((question, position) => ({
              position,
              type: question.type,
              text: question.text,
              image: question.image,
              timeLimitSeconds: question.timeLimitSeconds,
              maxPoints: question.maxPoints,
              options: {
                create: question.options.map((option, optionPosition) => ({
                  key: option.id,
                  position: optionPosition,
                  text: option.text,
                  isCorrect: option.isCorrect,
                })),
              },
            })),
          },
        },
        include,
      });
      return publicQuiz(quiz);
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Не удалось сохранить квиз.',
      });
    }
  }

  async get(id: string): Promise<PublicQuizResponse> {
    let quiz: StoredQuiz | null;
    try {
      quiz = await this.prisma.quiz.findUnique({ where: { id }, include });
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Не удалось получить квиз.',
      });
    }
    if (!quiz)
      throw new NotFoundException({
        code: 'QUIZ_NOT_FOUND',
        message: 'Квиз не найден.',
      });
    return publicQuiz(quiz);
  }
}
