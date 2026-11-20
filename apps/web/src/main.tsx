import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QuizWorkspace } from './QuizWorkspace';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QuizWorkspace />
  </StrictMode>,
);
