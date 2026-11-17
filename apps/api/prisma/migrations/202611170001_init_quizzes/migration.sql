-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('single', 'multiple');

-- CreateTable
CREATE TABLE "Quiz" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" VARCHAR(100) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "image" TEXT,
    "timeLimitSeconds" INTEGER NOT NULL,
    "maxPoints" INTEGER NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerOption" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "key" VARCHAR(256) NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,

    CONSTRAINT "AnswerOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Question_quizId_position_key" ON "Question"("quizId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerOption_questionId_key_key" ON "AnswerOption"("questionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerOption_questionId_position_key" ON "AnswerOption"("questionId", "position");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerOption" ADD CONSTRAINT "AnswerOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-local invariants; cross-row answer counts are enforced by validateQuestion.
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_title_nonempty" CHECK (length(btrim("title")) > 0);
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_description_length" CHECK (length("description") <= 2000);
ALTER TABLE "Question" ADD CONSTRAINT "Question_position_nonnegative" CHECK ("position" >= 0);
ALTER TABLE "Question" ADD CONSTRAINT "Question_timer_range" CHECK ("timeLimitSeconds" BETWEEN 5 AND 120);
ALTER TABLE "Question" ADD CONSTRAINT "Question_points_range" CHECK ("maxPoints" BETWEEN 100 AND 2000);
ALTER TABLE "Question" ADD CONSTRAINT "Question_content" CHECK (length(btrim("text")) > 0 OR ("image" IS NOT NULL AND length(btrim("image")) > 0));
ALTER TABLE "AnswerOption" ADD CONSTRAINT "AnswerOption_position_nonnegative" CHECK ("position" >= 0);
ALTER TABLE "AnswerOption" ADD CONSTRAINT "AnswerOption_key_nonempty" CHECK (length(btrim("key")) > 0);
ALTER TABLE "AnswerOption" ADD CONSTRAINT "AnswerOption_text_nonempty" CHECK (length(btrim("text")) > 0);
