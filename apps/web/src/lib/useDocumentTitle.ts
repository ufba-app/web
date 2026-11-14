import { useEffect } from 'react';

/** Título da aba por tela, para quem usa leitor de tela e para o histórico do navegador. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ufba.app`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
