import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../consts/routes';

/** «Назад» на предыдущую страницу приложения; если истории нет (открыли ссылку напрямую) — на главную */
export function useBack(): () => void {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(ROUTES.HOME);
  };
}
