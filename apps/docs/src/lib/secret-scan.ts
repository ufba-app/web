/**
 * Varredura de segredos no conteúdo baixado do memory, antes de ele ir para o disco e para o HTML. É a rede de
 * segurança que roda em todo build (local ou CI); no CI o gitleaks passa de novo pela mesma pasta.
 * Os achados dizem arquivo, linha e regra, nunca o valor encontrado: o log do build não pode virar um vazamento.
 */

export type Finding = { file: string; line: number; rule: string };

type Rule = { id: string; pattern: RegExp };

const RULES: Rule[] = [
  { id: 'chave-privada', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { id: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'chave-de-api-llm', pattern: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { id: 'stripe-key', pattern: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/ },
  { id: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*/ },
  { id: 'url-com-senha', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{4,}@[^\s/]+/i },
];

/** `senha = valor` / `token: valor` com valor longo e de aparência aleatória (entropia alta). */
const ASSIGNMENT = /\b(?:passw(?:or)?d|senha|secret|segredo|token|api[_-]?key|chave)\b["']?\s*[:=]\s*["']?([^\s"'`,;]{16,})/gi;

function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** Procura segredos em `files` (caminho → texto). `knownSecrets`: valores exatos que nunca podem aparecer. */
export function scanForSecrets(files: Array<{ path: string; text: string }>, knownSecrets: string[] = []): Finding[] {
  const known = knownSecrets.filter((secret) => secret.length >= 8);
  const findings: Finding[] = [];
  for (const { path, text } of files) {
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const report = (rule: string) => findings.push({ file: path, line: index + 1, rule });
      for (const rule of RULES) if (rule.pattern.test(line)) report(rule.id);
      for (const match of line.matchAll(ASSIGNMENT)) {
        const value = match[1] ?? '';
        if (entropy(value) >= 3.5 && /[0-9]/.test(value) && /[A-Za-z]/.test(value)) report('segredo-em-atribuicao');
      }
      if (known.some((secret) => line.includes(secret))) report('valor-de-segredo-conhecido');
    });
  }
  return findings;
}
