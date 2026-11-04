import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';
it('shows the platform heading and current availability', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { level: 1, name: 'Quiz Platform' }),
  ).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'Quiz Platform' }),
  ).toHaveTextContent('подготовлен каркас приложения');
});
