export function quizInput() {
  return {
    title: '  Проверка API  ',
    description: ' описание ',
    category: ' наука ',
    questions: [
      {
        type: 'single',
        text: ' Вопрос ',
        options: [
          { id: ' a ', text: ' Да ', isCorrect: true },
          { id: 'b', text: ' Нет ', isCorrect: false },
        ],
        timeLimitSeconds: 30,
        maxPoints: 1000,
      },
    ],
  };
}
