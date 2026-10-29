# Wind Planner

**One Standard. One Process. One Voice.**

Workspace de programação semanal de operação e manutenção de parques eólicos.
Interface em português, responsiva, com identidade visual inspirada na Vestas.

## Site Público

Endereço após ativar o GitHub Pages: **https://atrro.github.io/Ata_Prog_Semanal/**.

Visitantes consultam sem conta; somente o responsável autenticado pode publicar alterações.
O GitHub Pages hospeda a interface e a integração Supabase armazena os dados compartilhados.
O responsável precisa configurar o projeto Supabase e as duas variáveis públicas uma única vez.
Até isso ocorrer, o site informa que a nuvem não está configurada e não publica dados fictícios ou locais.
Veja o [passo a passo de publicação e nuvem](docs/PUBLICATION.md).

## Executar

Requer Node.js 24 e npm 11.

```bash
npm ci
npm run dev
```

Abra **http://localhost:3000**.

Sem variáveis de nuvem, o frontend local usa dados fictícios e persiste alterações no navegador. Não insira dados confidenciais.
Envio de e-mail e análise de riscos são explicitamente demonstrativos na interface.
Os dados locais do frontend **não são sincronizados com a API NestJS**. O modo público usa Supabase separadamente.

## Backend Local

```bash
docker compose up -d --build --wait api
```

- API: http://localhost:4000/api/v1
- OpenAPI: http://localhost:4000/api/docs
- PostgreSQL 17: localhost:5432, com volume persistente
- Azurite: localhost:10000, com volume persistente
- Credenciais locais do banco: `windplanner` / `local-development-only`

O Compose usa autenticação demo, restrita ao loopback. Não publique a API demo na internet.
Para o frontend containerizado, libere a porta 3000 e use `docker compose up -d --build --wait`.
`docker compose down` encerra serviços preservando os volumes.
Em ambientes Docker aninhados com bloqueio de rede bridge, veja a alternativa no manual técnico.

## Implementado

- Dashboard com KPIs, evolução semanal, distribuição por parque e histórico de envios.
- Histórico filtrável e paginado; criação, edição, duplicação, exclusão e visualização de atas.
- Checklist obrigatório com 13 itens, 12 seções padrão e blocos personalizados.
- Editor rico Tiptap, React Hook Form/Zod, anexos versionados, preview, downloads e links.
- PDF corporativo multipágina no navegador e geração/armazenamento de PDF no backend.
- Pré-visualização de e-mail com envio simulado na UI; adapter Graph no backend.
- Cadastro de parques, equipe demonstrativa, relatórios com linha/barras/pizza e dark mode.
- API NestJS com Clean Architecture em camadas, CQRS, DI e Repository Pattern.
- PostgreSQL com migrations, índices, controle de concorrência, snapshots e auditoria append-only.
- Guard Entra ID/RBAC na API, isolamento por empresa e bloqueio de auth demo em produção.
- Adapters Azure Blob, Graph e Azure OpenAI; outbox transacional de distribuição.
- Dockerfiles, Compose, Bicep parametrizado hml/prd e pipeline Azure DevOps.

## Limites

Esta entrega é uma **base funcional de produto**, não uma implantação corporativa concluída.
A UI é um protótipo independente da API: login MSAL/SSO e conexão frontend/API ainda precisam ser implementados.
MFA depende de Conditional Access no Entra ID. Integrações reais exigem recursos, consentimento e credenciais corporativas.
SharePoint, OneDrive e Power BI estão disponíveis como links e cartões de configuração, sem sincronização.
A tela Equipe usa perfis fictícios; atribuição corporativa de usuários é feita pelo Entra ID.
HML/PRD são templates, não ambientes provisionados. Escala de 500 simultâneos/100 mil atas não foi ensaiada.

## Verificação

```bash
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:integration
npm audit --omit=dev
```

Integração exige a API e PostgreSQL/Azurite saudáveis. Testes de navegador usam servidor existente ou iniciam um.

## Documentação

- [Arquitetura, diagrama e modelo ER](docs/ARCHITECTURE.md)
- [Contrato REST](docs/API.md)
- [Manual técnico e operação Azure](docs/TECHNICAL.md)
- [Manual do usuário](docs/USER_GUIDE.md)
- [Wireframes](docs/WIREFRAMES.md)
- [Homologação e produção](docs/RELEASE.md)

## Estrutura

```text
apps/web/              Next.js 16, React 19, TypeScript, Tailwind 4
apps/api/src/domain/   Entidades e invariantes Zod
apps/api/src/application/ CQRS, repository port e distribuição
apps/api/src/infrastructure/ PostgreSQL, Entra, Blob, Graph e PDF
apps/api/src/presentation/ REST, autorização e validação
database/              Migrations e seed demo
infra/                 Azure Bicep hml/prd
tests/                 Playwright e integração PostgreSQL/Blob
docs/                  Arquitetura, contratos, wireframes e manuais
```

Fotografias Unsplash ilustrativas, não correspondem aos parques cadastrados.
Referências à Vestas não indicam afiliação ou homologação oficial.