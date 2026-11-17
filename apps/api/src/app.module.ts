import { Module, type DynamicModule } from '@nestjs/common';
import { QuizzesModule } from './quizzes/quizzes.module';
import { AppController } from './app.controller';

@Module({ controllers: [AppController] })
export class AppModule {
  static configure(enableQuizApi = false): DynamicModule {
    return { module: AppModule, imports: enableQuizApi ? [QuizzesModule] : [] };
  }
}
