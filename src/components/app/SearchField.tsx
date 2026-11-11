import { Kbd, SearchField as HeroSearchField } from '@heroui/react';
import { useEffect, useRef } from 'react';

export type SearchFieldProps = {
  placeholder?: string;
  onSubmit?: (value: string) => void;
  /** Ctrl K ou ⌘ K focam o campo. Padrão: ligado. */
  shortcut?: boolean;
  'aria-label'?: string;
};

export function SearchField({
  placeholder = 'Buscar disciplina, tarefa, professor',
  onSubmit,
  shortcut = true,
  'aria-label': label = 'Buscar',
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [shortcut]);

  return (
    <HeroSearchField className="ufba-search" aria-label={label} onSubmit={onSubmit}>
      <HeroSearchField.Group className="ufba-search__group">
        <HeroSearchField.SearchIcon />
        <HeroSearchField.Input ref={inputRef} placeholder={placeholder} />
        <HeroSearchField.ClearButton />
        {shortcut ? <Kbd className="ufba-search__kbd">Ctrl K</Kbd> : null}
      </HeroSearchField.Group>
    </HeroSearchField>
  );
}
