# @ufba-app/web-ui

Componentes React do ufba.app, construídos sobre [HeroUI v3](https://heroui.com). A referência visual é o canvas "UFBA Design System"; as regras estão na [especificação](../../docs/specs/2026-11-11-design-system-design.md).

## Instalação

```bash
pnpm add @ufba-app/web-ui @ufba-app/tokens react react-dom tailwindcss@^4
```

O pacote é publicado no GitHub Packages, que pede um token mesmo para pacotes públicos. Crie um token clássico com o escopo `read:packages` e, no `.npmrc` do app:

```
@ufba-app:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Deixe o token na variável de ambiente `GITHUB_TOKEN` (no CI do GitHub Actions ela já existe), nunca escrito no arquivo.

## Estilos

Importe um único arquivo, uma vez, no CSS global do app. Ele traz Tailwind, os tokens, o HeroUI e o tema do ufba.app, nessa ordem.

```css
/* app/globals.css */
@import "@ufba-app/web-ui/styles.css";
```

## Fontes

O pacote declara as famílias, mas não carrega os arquivos. O `next/font` registra cada fonte com um nome gerado, então é preciso ligar as variáveis dele às do sistema. No Next.js:

```tsx
// app/layout.tsx
import { Plus_Jakarta_Sans, Sora } from 'next/font/google';

const sora = Sora({ subsets: ['latin'], weight: ['600', '800'], variable: '--font-sora' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-jakarta' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${jakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

```css
/* app/globals.css, depois do import do pacote */
:root {
  --ufba-font-display: var(--font-sora), "Trebuchet MS", system-ui, sans-serif;
  --ufba-font-body: var(--font-jakarta), "Segoe UI", system-ui, sans-serif;
}
```

Sem as fontes carregadas, os textos caem numa fonte sem serifa do sistema.

## Componentes

Todos são Client Components (`"use client"`), prontos para o App Router.

### Button

| `variant` | Uso |
|---|---|
| `primary` (padrão) | A ação principal. Um por tela. |
| `outline` | Ações secundárias. |
| `highlight` | Ação ligada a algo urgente (amarelo). |
| `ghost` | Ação discreta, como Cancelar. |
| `danger` | Ação destrutiva. |

`size`: `sm` ou `md` (padrão). Os demais props são os do `Button` do HeroUI.

```tsx
<Button>Concluir e autorizar</Button>
<Button variant="outline">Atualizar</Button>
<Button variant="highlight">Entregar hoje</Button>
```

### Chip

| `tone` | Uso |
|---|---|
| `neutral` (padrão) | Informação sem urgência: "4º semestre", "3 dias". |
| `highlight` | O que é agora ou está no limite: "amanhã", "no limite". |
| `success` | Deu certo: "subiu 0,1". |
| `danger` | Erro: "senha incorreta". Nunca para prazo. |
| `solid` | Estado forte: "Moodle conectado". |

```tsx
<Chip tone="highlight">amanhã</Chip>
```

### Reexportados do HeroUI

Saem com o tema aplicado e a API original: `Input`, `TextField`, `Kbd`, `Tabs`, `Card`, `Avatar`, `Checkbox`, `Link`, `Tooltip`, `Modal`, `Toast`, `Skeleton`, `Separator`, `ProgressBar`. Veja a documentação de cada um em heroui.com.

## Regras do sistema

- Nenhuma sombra. Superfícies têm borda de 1px.
- Cantos de 20px; selos totalmente redondos.
- O amarelo nunca é cor de texto.
- No máximo um botão `primary` e um círculo amarelo de grafismo por tela.
