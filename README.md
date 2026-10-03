# Orlando 2027 — app da família

App de celular (PWA) para a viagem: roteiro, compras, restaurantes, passeios e checklist.
O que a família marca (checklist, status, favoritos, notas, avaliações, lista de compras e plano de cada dia) fica num banco compartilhado no **Supabase** e aparece em tempo real para todos.
O app abre e funciona sem internet. As alterações feitas offline sobem sozinhas quando a conexão volta.

Ninguém precisa de conta: cada pessoa digita o **nome** dela e o **código da família**, uma vez por aparelho.

```
orlando-2027-app/
├── index.html            ← a tela do app
├── manifest.webmanifest  ← nome e ícone do app instalado
├── sw.js                 ← funcionamento offline
├── css/                  ← Bootstrap + estilo Unimed
├── config.js          ← ⚠ você preenche (passo 4)
├── dados.js           ← base de lojas, restaurantes, roteiro e checklist padrão
├── js/app.js             ← lógica do app
├── icons/
└── schema.sql   ← cria a tabela no banco (passo 2)
```

---

## Passo 1 — Criar o banco no Supabase (5 min)

1. Entre em **supabase.com** e crie uma conta (pode usar o login do GitHub).
2. Clique em **New project**.
   - Nome: `orlando-2027`
   - Senha do banco: gere uma e guarde (não é o código da família).
   - Região: qualquer uma serve; *East US* fica perto de Orlando.
3. Espere o projeto terminar de criar (1–2 min).

## Passo 2 — Criar a tabela

1. No menu lateral, abra **SQL Editor** → **New query**.
2. Cole todo o conteúdo de `schema.sql` e clique em **Run**.
3. Deve aparecer "Success. No rows returned".

## Passo 3 — Criar o acesso da família e fechar cadastros

1. Abra **Authentication** → **Users** → **Add user** → **Create new user**.
   - E-mail: `familia@orlando2027.app` (não precisa existir; é só um identificador)
   - Senha: **o código da família**. Use algo fácil de falar e difícil de adivinhar, com 10 ou mais caracteres, ex.: `mickey-magic-2027`.
   - Marque **Auto Confirm User**.
2. **Importante:** em **Authentication**, procure as configurações de cadastro (*Sign In / Providers* ou *Settings*) e **desligue "Allow new users to sign up"**. Assim ninguém consegue criar outra conta usando o app; só entra quem tem o código.

## Passo 4 — Ligar o app ao banco

1. Abra **Project Settings** → **API** (em algumas versões: *Data API* e *API Keys*).
2. Copie:
   - **Project URL** (ex.: `https://abcdefghijkl.supabase.co`)
   - a chave **anon public** (ou **publishable**). Nunca use a chave *service_role* / *secret*.
3. Abra `config.js` e preencha:

```js
window.ORL_CONFIG = {
  supabaseUrl: 'https://abcdefghijkl.supabase.co',
  supabaseAnonKey: 'cole-a-chave-aqui',
  familyEmail: 'familia@orlando2027.app'
};
```

Essa chave pode ficar pública: sem o código da família ela não lê nem grava nada.

## Passo 5 — Publicar no GitHub Pages (5 min)

1. Em **github.com**, clique em **New repository**.
   - Nome: `orlando-2027`
   - Visibilidade: **Public** (o GitHub Pages gratuito exige repositório público; veja a nota de privacidade abaixo).
   - Crie o repositório.
2. Na página do repositório, clique em **uploading an existing file** (ou **Add file → Upload files**).
3. Arraste **o conteúdo** da pasta `orlando-2027-app` (o `index.html` precisa ficar na raiz, não dentro de outra pasta) e clique em **Commit changes**.
4. Vá em **Settings → Pages**:
   - *Source*: **Deploy from a branch**
   - *Branch*: **main** e pasta **/ (root)** → **Save**.
5. Em 1–2 minutos o endereço aparece no topo da página, algo como
   `https://SEU-USUARIO.github.io/orlando-2027/`

## Passo 6 — Instalar nos celulares

- **iPhone (Safari):** abra o link → botão **Compartilhar** → **Adicionar à Tela de Início**.
- **Android (Chrome):** abra o link → menu **⋮** → **Instalar app** (ou *Adicionar à tela inicial*).

Na primeira abertura, cada pessoa digita o nome e o código da família. Mande para a família só o **link** e o **código**.

Para trazer o que você já tinha marcado na versão anterior: na versão antiga, use **Viagem → Copiar backup**; na nova, cole o texto em **Viagem → Restaurar backup colado**.

---

## No dia a dia

- **Quem fez o quê:** checklist, status e notas mostram quem alterou e quando. A tela *Hoje* tem a lista "Atividade da família".
- **Sem internet (parques, avião):** continue usando normalmente. O topo mostra "Offline · N para enviar" e envia tudo quando a conexão volta.
- **Duas pessoas mexendo no mesmo item ao mesmo tempo:** vale a última alteração enviada.
- **Esqueceu o código / quer trocar:** em Supabase → Authentication → Users, abra o usuário da família e defina uma nova senha. Cada aparelho vai pedir o código novo quando a sessão expirar ou depois de **Sair deste aparelho**.

## Atualizar lugares, horários ou o roteiro

Os dados fixos estão em `dados.js`. No GitHub, abra o arquivo → ícone de lápis → edite → **Commit changes**.
O app atualiza sozinho: a nova versão aparece **na segunda vez** que cada pessoa abre o app (a primeira abertura baixa a atualização em segundo plano).
Se mudar outros arquivos e quiser forçar a atualização, troque `orlando2027-v1` por `orlando2027-v2` em `sw.js`.

## Cuidados

- **Supabase gratuito pausa projetos parados:** se o banco ficar cerca de uma semana sem nenhum acesso, o projeto pode ser pausado. Até a viagem, abra o app de vez em quando. Se pausar, entre no painel do Supabase e clique em **Restore**; os dados não se perdem.
- **Privacidade:** com repositório público, qualquer pessoa pode ver o *código* do app, incluindo o que está em `dados.js` (voo, hotel, roteiro). O que a família marca fica no banco, protegido pelo código.
  Se preferir esconder até o código, use repositório **privado** e publique pelo **Netlify** ou **Cloudflare Pages** (ambos gratuitos e aceitam repositório privado) em vez do GitHub Pages.
- Não guarde passaporte, eTicket ou dados de cartão no app.
