import { useId, useState, type FormEvent } from 'react';
import { Button } from '../Button';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RequestAccessProps = {
  /** Recebe o e-mail já validado e sem espaços. */
  onRequest: (email: string) => void;
  label?: string;
};

/** Campo para pedir acesso de uma conta Google pessoal ao Classroom. */
export function RequestAccess({ onRequest, label = 'Gmail da outra conta' }: RequestAccessProps) {
  const id = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const email = value.trim();
    if (!EMAIL.test(email)) {
      setError('Digite um e-mail válido.');
      return;
    }
    setError('');
    setValue('');
    onRequest(email);
  };

  return (
    <form className="ufba-request-access" onSubmit={submit} noValidate>
      <label className="ufba-visually-hidden" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ufba-field"
        type="email"
        placeholder="Turmas em outra conta? seu.email@gmail.com"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-erro` : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError('');
        }}
      />
      <Button variant="outline" size="sm" type="submit">
        Pedir acesso
      </Button>
      {error ? (
        <p id={`${id}-erro`} className="ufba-request-access__error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
