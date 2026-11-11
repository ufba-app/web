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
| `ghost` | Ação discreta. |
| `danger` | Confirmação destrutiva: "Revogar acesso". |
| `danger-text` | Ação negativa sem fundo: "Recusar", "Revogar". |

`size`: `sm` ou `md` (padrão). Os demais props são os do `Button` do HeroUI.

```tsx
<Button>Concluir e autorizar</Button>
<Button variant="outline">Atualizar</Button>
<Button variant="danger-text">Recusar</Button>
```

### Chip

| `tone` | Uso |
|---|---|
| `neutral` (padrão) | Informação sem urgência: "4º semestre", "3 dias". |
| `highlight` | Informação do próprio app, no amarelo da marca: "2 de 3 conectadas". Nunca para estado. |
| `success` | Deu certo: "Conectado", "Verificado". |
| `warning` | Espera ou atenção: "Aguardando liberação", "Não verificado". |
| `danger` | Problema: "Sessão expirou". |
| `solid` | Estado forte: "Moodle conectado". |

```tsx
<Chip tone="warning">Aguardando liberação</Chip>
```

### Estrutura de aplicação

| Componente | O que faz |
|---|---|
| `AppShell` | Coluna de navegação de 240px e área de conteúdo (`<main>`). Abaixo de 820px vira barra superior com botão "Abrir menu". |
| `SideNav`, `SideNavGroup`, `SideNavItem` | Navegação lateral com grupos, ícone, contador e item atual (`current`). |
| `UserBadge` | Avatar com iniciais, nome e detalhe (matrícula, curso). |
| `PageHeader` | Título da página (`h1`), linha de apoio e ações. |
| `SyncStatus` | "Sincronizado há N min" com o botão Atualizar. O texto se atualiza sozinho a cada minuto. |
| `SearchField` | Campo de busca; Ctrl K ou ⌘ K focam o campo. |

`SideNavItem` usa `<a>` por padrão. No Next.js, passe o `Link` em `as`:

```tsx
import Link from 'next/link';
import {
  AppShell, PageHeader, SearchField, SideNav, SideNavGroup, SideNavItem, SyncStatus, UserBadge,
} from '@ufba-app/web-ui';

<AppShell
  topBar={<UserBadge name="Marina Costa" />}
  sidebar={
    <SideNav brand="UFBA" footer={<UserBadge name="Marina Costa" detail="222115043, BCC" />}>
      <SideNavItem as={Link} href="/" current>Painel</SideNavItem>
      <SideNavItem as={Link} href="/prazos" count={4}>Prazos</SideNavItem>
      <SideNavGroup label="Disciplinas de 2026.2">
        <SideNavItem as={Link} href="/disciplinas/mata60">Banco de Dados</SideNavItem>
      </SideNavGroup>
    </SideNav>
  }
>
  <PageHeader
    title="Bom dia, Marina."
    description="Quarta, 4 de novembro. Semana 12 de 18 do semestre."
    actions={
      <>
        <SearchField onSubmit={(q) => router.push(`/busca?q=${encodeURIComponent(q)}`)} />
        <SyncStatus lastSync={ultimaSincronizacao} onRefresh={sincronizar} isRefreshing={sincronizando} />
      </>
    }
  />
  {/* conteúdo da página */}
</AppShell>
```

Os componentes não buscam dados: recebem valores por props e avisam por callbacks.

### Autenticação

Telas fora do painel: entrar, autorizar um app e erro de autorização.

| Componente | O que faz |
|---|---|
| `AuthLayout` | Bloco marinho com a marca à esquerda e o cartão à direita; `below` fica logo abaixo do cartão. No celular, só o cartão. |
| `ServiceIcon` | Ícone do SIGAA, Moodle, Classroom ou Google. Com `label` tem nome acessível; sem, é decorativo. |
| `ClientRequest` | Quem pede acesso: ícone ou inicial, nome, selo "Verificado" e "Volta para <domínio>". Sem `verified`, mostra o aviso de app não verificado. |
| `ScopeList` | "Vai ver": as fontes e o estado de cada conexão. |
| `AccountLine` | "Como <e-mail>" e "Trocar conta". |
| `Notice` | Aviso em linha: `info`, `warning` ou `danger` (anunciado como alerta). |

```tsx
<AuthLayout
  headline="Você decide quem lê seus dados."
  subline="Só leitura. Dá para revogar quando quiser."
  below={<AccountLine email={conta.email} onSwitch={trocarConta} />}
>
  <ClientRequest name={app.nome} verified={app.verificado} logo={app.icone} returnDomain={app.dominio} />
  <ScopeList items={fontes} />
  <Button onPress={autorizar}>Autorizar</Button>
  <Button variant="danger-text" onPress={recusar}>Recusar</Button>
</AuthLayout>
```

O nome do app é o que ele declarou no cadastro e não é confiável sozinho. Passe `verified` e `logo` só para apps de uma lista própria de verificados, nunca o logo que o app enviou.

### Conexões

| Componente | O que faz |
|---|---|
| `SourceCard` | Cartão de uma fonte, com ícone, título, descrição, selo, ação e conteúdo extra. |
| `AccountRow` | Conta Google pessoal: `connected`, `pending` ou `expired`. |
| `RequestAccess` | Campo de Gmail com "Pedir acesso"; valida o e-mail antes de chamar `onRequest`. |
| `Dialog` | Diálogo sobre a página, com ícone, título, conteúdo e botões. Foco e Esc vêm do HeroUI. |
| `StepList` | Passo a passo numerado; passos feitos aparecem com check e saem da numeração. |

Ordem das fontes na tela: SIGAA, Moodle e Classroom.

### Apps autorizados

| Componente | O que faz |
|---|---|
| `AppRow` | App com selo, domínio de retorno, data da autorização, último uso e "Revogar". Revogar só chama `onRevoke`: confirme num `Dialog`. |
| `EmptyState` | Estado vazio com título, descrição e ação. |

`PageHeader` aceita `aside` para um contador ao lado do título.

### Reexportados do HeroUI

Saem com o tema aplicado e a API original: `Input`, `TextField`, `Kbd`, `Tabs`, `Card`, `Avatar`, `Checkbox`, `Link`, `Tooltip`, `Modal`, `Toast`, `Skeleton`, `Separator`, `ProgressBar`. Veja a documentação de cada um em heroui.com.

## Regras do sistema

- Nenhuma sombra. Cartões têm borda de 1px; botão secundário e campos, 1,5px no marinho.
- Cantos de 20px; selos totalmente redondos.
- O amarelo da marca é só grafismo e informação do app. Estados usam verde, alerta e vermelho.
- Páginas em fundo azul-claro (`--ufba-page`), cartões brancos.
- Textos curtos: uma frase.
- No máximo um botão `primary` por tela.
