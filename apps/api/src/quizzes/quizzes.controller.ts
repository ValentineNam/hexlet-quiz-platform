import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { PublicQuizResponse } from '@quiz/shared';
import { QuizzesService } from './quizzes.service';

@Controller('quizzes')
export class QuizzesController {
  constructor(
    @Inject(QuizzesService) private readonly quizzes: QuizzesService,
  ) {}
  @Post()
  create(@Body() input: unknown): Promise<PublicQuizResponse> {
    return this.quizzes.create(input);
  }
  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<PublicQuizResponse> {
    return this.quizzes.get(id);
  }
}
