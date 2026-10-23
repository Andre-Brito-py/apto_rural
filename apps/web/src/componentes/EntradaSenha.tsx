import { useId, useState, type KeyboardEvent } from 'react';
import { Icone } from './Icones';

/**
 * Campo de senha com o botão "Mostrar", para conferir o que foi digitado (ou o
 * que o navegador preencheu sozinho), e aviso de Caps Lock ligado.
 */
export function EntradaSenha({
  value,
  onChange,
  autoComplete,
  rotulo,
}: {
  value: string;
  onChange: (valor: string) => void;
  autoComplete: 'current-password' | 'new-password';
  /** Texto do rótulo; o campo já vem dentro de um <label>. */
  rotulo: string;
}) {
  const [visivel, setVisivel] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const id = useId();
  const conferirCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className="campo">
      <label className="rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <div className="entrada-senha">
        <input
          id={id}
          className="entrada"
          type={visivel ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={conferirCaps}
          onKeyDown={conferirCaps}
          onBlur={() => setCapsLock(false)}
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
        />
        <button
          type="button"
          className="ver-senha"
          aria-controls={id}
          aria-pressed={visivel}
          aria-label={visivel ? 'Esconder a senha' : 'Mostrar a senha'}
          onClick={() => setVisivel((v) => !v)}
        >
          <Icone nome={visivel ? 'olhoFechado' : 'olho'} />
          <span>{visivel ? 'Esconder' : 'Mostrar'}</span>
        </button>
      </div>
      {capsLock && (
        <span className="ajuda aviso-caps" role="status">
          O Caps Lock está ligado.
        </span>
      )}
    </div>
  );
}
