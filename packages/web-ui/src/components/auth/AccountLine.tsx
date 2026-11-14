export type AccountLineProps = { email: string; onSwitch?: () => void };

/** "Como <email>" com "Trocar conta". Fica abaixo do cartão, fora dele. */
export function AccountLine({ email, onSwitch }: AccountLineProps) {
  return (
    <div className="ufba-account-line">
      <span>
        Como <strong>{email}</strong>
      </span>
      {onSwitch ? (
        <button type="button" className="ufba-account-line__switch" onClick={onSwitch}>
          Trocar conta
        </button>
      ) : null}
    </div>
  );
}
