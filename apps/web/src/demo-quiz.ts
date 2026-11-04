import { validateQuestion, type Question } from '@quiz/shared';

export const DEMO_QUIZ_TITLE = 'Маленькое путешествие в науку';
const items = [
  {
    type: 'single',
    text: 'Какая планета Солнечной системы известна как Красная планета?',
    options: [
      { id: 'venus', text: 'Венера', isCorrect: false },
      { id: 'mars', text: 'Марс', isCorrect: true },
      { id: 'jupiter', text: 'Юпитер', isCorrect: false },
      { id: 'mercury', text: 'Меркурий', isCorrect: false },
    ],
    timeLimitSeconds: 30,
    maxPoints: 1000,
    explanation:
      'Красноватый оттенок поверхности Марса связан с оксидами железа.',
  },
  {
    type: 'multiple',
    text: 'Какие из этих животных относятся к млекопитающим?',
    options: [
      { id: 'dolphin', text: 'Дельфин', isCorrect: true },
      { id: 'shark', text: 'Акула', isCorrect: false },
      { id: 'bat', text: 'Летучая мышь', isCorrect: true },
      { id: 'penguin', text: 'Пингвин', isCorrect: false },
    ],
    timeLimitSeconds: 20,
    maxPoints: 1500,
    explanation:
      'Дельфины и летучие мыши выкармливают детёнышей молоком. Акула — рыба, а пингвин — птица.',
  },
  {
    type: 'single',
    text: 'Сколько сторон у треугольника?',
    options: [
      { id: 'three', text: 'Три', isCorrect: true },
      { id: 'four', text: 'Четыре', isCorrect: false },
      { id: 'five', text: 'Пять', isCorrect: false },
    ],
    timeLimitSeconds: 5,
    maxPoints: 500,
    explanation: 'У треугольника три стороны и три угла.',
  },
] satisfies (Question & { explanation: string })[];

export const demoQuestions = items.map(({ explanation, ...input }) => {
  const result = validateQuestion(input);
  if (!result.success) throw new Error('Некорректный демонстрационный вопрос.');
  return { question: result.data, explanation };
});
export const DEMO_MAX_POINTS = demoQuestions.reduce(
  (total, item) => total + item.question.maxPoints,
  0,
);
