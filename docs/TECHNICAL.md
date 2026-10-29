# Manual Técnico

## Ambiente Local

Node.js 24, npm 11 e Docker Compose. `npm ci`, `npm run dev`,
`docker compose up -d --build --wait api`.
UI 3000, API 4000, PostgreSQL 5432 e Azurite 10000, com volumes persistentes.
API demo não deve ter porta pública no Codespaces.

Docker aninhado pode bloquear tráfego bridge. Alternativa verificada:

```bash
docker compose up -d postgres azurite
```

Exporte as variáveis do arquivo de exemplo para o terminal, com PostgreSQL/Blob em 127.0.0.1.
Então execute `npm run migrate -w apps/api`, `npx tsx apps/api/src/infrastructure/init-storage.ts`,
`npm run build -w apps/api` e `node apps/api/dist/main.js`.
Para o seed, `SEED_DEMO=true` apenas local. O dotenv usa o diretório de trabalho;
defina `DOTENV_CONFIG_PATH` absoluto se mantiver `.env` na raiz.
Não commite segredos.

## Configuração

| Variável | Finalidade |
|---|---|
| DATABASE_URL | Conexão PostgreSQL, TLS verify-full em cloud |
| AUTH_MODE | demo local; entra corporativo |
| NODE_ENV | production bloqueia auth demo e seed |
| WEB_URL | Origem CORS autorizada e base dos links |
| PORT | Porta API, padrão 4000 |
| ENTRA_TENANT_ID / ENTRA_AUDIENCE | Tenant e audience da API |
| AZURE_CLIENT_ID | Identidade gerenciada user-assigned |
| AZURE_STORAGE_ACCOUNT / AZURE_STORAGE_CONTAINER | Blob privado |
| AZURE_STORAGE_CONNECTION_STRING | Somente desenvolvimento/Azurite |
| GRAPH_SENDER | Mailbox autorizada |
| GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET | Opcional; preferir managed identity |
| TEAMS_TEAM_ID / TEAMS_CHANNEL_ID | Destino após consentimento |
| WORKER_ENABLED | true só após validar distribuição |
| AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_DEPLOYMENT | Endpoint HTTPS e deployment aprovado |

## Banco

Runner SQL com `schema_migrations`, advisory lock e transação por arquivo.
Não alterar migrations aplicadas; adicionar arquivos com prefixo sequencial.
Rodar pelo workspace `apps/api`, como no Compose.
Cloud exige etapa de migration única e controlada, não startup de cada réplica.
Separar usuário de migration e runtime. Runtime não deve poder DDL, TRUNCATE ou desabilitar triggers.
Cadastrar em `companies` uma empresa ativa com ID do tenant Entra antes do acesso corporativo.
Seed demo não é onboarding de produção.

## Identidade e Microsoft 365

Registrar API single-tenant com access tokens v2 e app roles Administrador, Dispatcher, Leitor.
Atribuir grupos às roles. Conditional Access deve exigir MFA conforme política da empresa.
Frontend ainda precisa de MSAL Authorization Code + PKCE, `/me` e consumo autenticado da API.
Não enviar ID token para a API e não aceitar role/tenant do navegador como autorização.

Outlook: `Mail.Send` application permission, restrita à mailbox via Exchange Application RBAC/política suportada.
Conceder permissão Graph à identidade gerenciada ou usar app registration com segredo no Key Vault.

Teams: o envio normal de mensagem por aplicação não funciona com permissão genérica de migração.
`Teamwork.Migrate.All` não é apropriada ao fluxo operacional.
O adapter app-only requer Teams app com consentimento específico `ChannelMessage.Send.Group`
instalado na equipe e suporte validado no tenant. Alternativa: adapter delegado `ChannelMessage.Send`
ou Teams Workflows aprovado. Manter desabilitado até validar.

SharePoint/OneDrive/Power BI: links, não sincronização ou embed autenticado nesta versão.
Não conceder permissões globais de arquivos para implementar apenas links.

## Azure e Pipeline

`infra/main.bicep`: ambientes hml/prd, App Service Linux, ACR, PostgreSQL, Blob privado/versionado,
Key Vault RBAC/purge protection e identidade gerenciada. SKU/HA/zonas dependem da região.
Compilar e revisar antes de provisionar:

```bash
az bicep build --file infra/main.bicep
az deployment group what-if --resource-group <grupo> --template-file infra/main.bicep --parameters @<parametros-seguros>
az deployment group create --resource-group <grupo> --template-file infra/main.bicep --parameters @<parametros-seguros>
```

Não passar senhas literais no shell ou em arquivos versionados.
O template não abre firewall PostgreSQL: adicionar VNet/private endpoint e DNS ou allowlist mínima
dos IPs de saída e agente de migration. Sem rede, readiness falhará corretamente.
Configurar firewall Storage/Key Vault conforme landing zone.
Serviços têm criptografia em repouso e TLS; CMK, criptografia cliente e WORM requerem decisões adicionais.

Pipeline Azure DevOps: criar variable group `wind-planner-deploy` com `acrServiceConnection`,
`azureServiceConnection`, `registryHost`, `hmlApiApp`, `hmlWebApp`, `prdApiApp`, `prdWebApp`.
Criar Environments `wind-planner-hml`/`wind-planner-prd` e approvals/checks externos à pipeline.
Adicionar migration controlada antes do deploy cloud. A base não provisiona infra nem migra bancos cloud automaticamente.
Bicep cria um ACR por ambiente; a pipeline assume registry central: atribuir AcrPull às identidades
dos dois ambientes ou adaptar promoção por digest entre registries.

## Operação

Health live: processo; ready: banco/tabela de migrations, não validade de todas as integrações.
Adicionar Application Insights/OpenTelemetry, correlation ID, p95, fila, 5xx e alertas de dependências.
Não logar tokens, conteúdo de atas, destinatários ou segredos.
Jobs UNCERTAIN exigem conferência em Sent Items pelo header x-wind-planner-job e decisão administrativa auditada.
Sem retry automático em falha incerta. PDF pode existir mesmo se Graph falhar.

Definir retenção LGPD de participantes, anexos, versões, outbox, e-mails, logs e backups.
Testar PITR PostgreSQL e restauração Blob em HML, com RPO/RTO aprovados.
Rollback de aplicativo por digest de imagem anterior; migrations compensatórias preservam histórico.
Limpeza de blobs órfãos deve usar inventário e janela segura.
Arquivos Office exigem scanner antimalware/quarentena antes do go-live.