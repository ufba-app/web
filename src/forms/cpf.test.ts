import { sigaaFormSchema } from './sigaa';
import { cpfDigits, formatStoredCpf, isValidCpf, maskCpf } from './cpf';

// 529.982.247-25 é um CPF com dígitos verificadores corretos, usado só em testes.
const VALID = '52998224725';

describe('maskCpf', () => {
  it('aplica a máscara conforme digita', () => {
    expect(maskCpf('5')).toBe('5');
    expect(maskCpf('529')).toBe('529');
    expect(maskCpf('5299')).toBe('529.9');
    expect(maskCpf('529982')).toBe('529.982');
    expect(maskCpf('5299822')).toBe('529.982.2');
    expect(maskCpf('529982247')).toBe('529.982.247');
    expect(maskCpf('5299822472')).toBe('529.982.247-2');
    expect(maskCpf(VALID)).toBe('529.982.247-25');
  });

  it('ignora o que não é dígito e corta em 11', () => {
    expect(maskCpf('abc')).toBe('');
    expect(maskCpf('CPF: 529.982.247-25')).toBe('529.982.247-25');
    expect(maskCpf('52998224725999')).toBe('529.982.247-25');
    expect(maskCpf('  529 982 247 25 ')).toBe('529.982.247-25');
  });

  it('é idempotente: mascarar duas vezes dá o mesmo resultado', () => {
    expect(maskCpf(maskCpf('529982247'))).toBe('529.982.247');
    expect(maskCpf(maskCpf(VALID))).toBe('529.982.247-25');
  });
});

describe('isValidCpf', () => {
  it('aceita um CPF válido, com ou sem pontuação', () => {
    expect(isValidCpf(VALID)).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it.each([
    ['dígito verificador errado', '52998224724'],
    ['sequência repetida', '11111111111'],
    ['curto', '5299822472'],
    ['vazio', ''],
    ['letras', 'abcdefghijk'],
  ])('recusa %s', (_name, value) => {
    expect(isValidCpf(value)).toBe(false);
  });
});

describe('formatStoredCpf', () => {
  it('mascara um CPF válido e devolve null para qualquer outro login', () => {
    expect(formatStoredCpf(VALID)).toBe('529.982.247-25');
    expect(formatStoredCpf('marina.costa')).toBeNull();
    expect(formatStoredCpf('52998224724')).toBeNull();
  });
});

describe('cpfDigits', () => {
  it('tira tudo que não é dígito', () => {
    expect(cpfDigits('529.982.247-25')).toBe(VALID);
  });
});

describe('sigaaFormSchema', () => {
  const parse = (value: { login: string; password: string }) => sigaaFormSchema.safeParse(value);

  it('devolve o login só com dígitos e a senha intacta', () => {
    const result = parse({ login: ' 529.982.247-25 ', password: ' a b ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ login: VALID, password: ' a b ' });
  });

  it('mensagens por campo, em pt-BR, e a primeira do CPF é a de vazio', () => {
    const empty = parse({ login: '', password: '' });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      const messages = empty.error.issues.map((issue) => issue.message);
      expect(messages).toEqual(['Digite o CPF.', 'Digite a senha do SIGAA.']);
    }

    const invalid = parse({ login: '529.982.247-24', password: 'x' });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues.map((issue) => issue.message)).toEqual(['CPF inválido. Confira os 11 números.']);
  });

  it('não coloca a senha digitada dentro dos erros', () => {
    const result = parse({ login: 'x', password: '' });
    expect(JSON.stringify(result)).not.toContain('s3nh4-secreta');
    const withPassword = parse({ login: 'x', password: 's3nh4-secreta' });
    expect(JSON.stringify(withPassword)).not.toContain('s3nh4-secreta');
  });
});
