import { useCallback, useState } from 'react';

const KEY = 'ufba:academic:hide-grades';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * "Esconder notas": preferência só deste navegador (conveniência, não dado da conta). Se o armazenamento estiver
 * bloqueado, vale só até recarregar. Os valores escondidos nem entram no HTML.
 */
export function useHideGrades(): [hidden: boolean, toggle: () => void] {
  const [hidden, setHidden] = useState(read);
  const toggle = useCallback(() => {
    setHidden((current) => {
      const next = !current;
      try {
        if (next) window.localStorage.setItem(KEY, '1');
        else window.localStorage.removeItem(KEY);
      } catch {
        // sem armazenamento: a escolha vale só nesta tela
      }
      return next;
    });
  }, []);
  return [hidden, toggle];
}
