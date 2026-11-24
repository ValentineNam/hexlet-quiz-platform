import { Module } from '@nestjs/common';
import { ReadinessController } from '../database/readiness.controller';
import { ReadinessService } from '../database/readiness.service';
import { PrismaService } from '../database/prisma.service';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';

@Module({
  controllers: [QuizzesController, ReadinessController],
  providers: [PrismaService, QuizzesService, ReadinessService],
})
export class QuizzesModule {}
