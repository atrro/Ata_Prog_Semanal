# Homologação e Produção

## Estado da Entrega

| Entregável | Estado |
|---|---|
| Arquitetura, diagrama, ER | Documentados |
| SQL, migrations, índices, auditoria | Implementados PostgreSQL |
| Frontend | Protótipo local funcional, não conectado à API |
| Backend | API executável, regras e adapters |
| Dockerfiles/Compose | Incluídos; rede bridge depende do host |
| Azure DevOps | Base de pipeline; configuração/aprovações pendentes |
| HML/PRD | Templates Bicep, não provisionados |
| Manuais e wireframes | Incluídos |
| SSO/MFA | Guard na API; login UI e política tenant pendentes |
| Microsoft 365/IA | Adapters não validados contra tenant real |
| 500 simultâneos/100 mil atas | Meta, não ensaiada |
| Multiempresa/países/idiomas | Schema preparado; UI pt-BR, auth single-tenant |

## Gates de HML

- Implementar MSAL/PKCE e conectar interface à API, com paginação de servidor e cache autenticado.
- Remover dados e seleção de role demo no modo corporativo.
- Implementar deep link `?minute=` para atas publicadas no Teams.
- Compilar Bicep, revisar what-if, rede privada/DNS/firewall, Key Vault e identidades.
- Aplicar migrations uma vez e cadastrar tenant; separar credenciais runtime/migration.
- Exigir TLS, origem CORS explícita e Conditional Access MFA.
- Testar 401/403 com tokens reais, perfis, tenant e audiences incorretas.
- Adicionar antimalware/quarentena de arquivos, sanitização de conteúdo e limpeza de blobs órfãos.
- Conectar observabilidade, alertas de fila, erros Graph e healthchecks.
- Validar Mail.Send com escopo de mailbox e consentimento RSC/alternativa Teams.
- Testar envio real, anexos, timeout, reconciliação e PDF da mesma versão congelada.
- Aprovar Azure OpenAI, tratamento de dados, revisão humana e política LGPD.
- Substituir fontes/imagens externas por assets corporativos aprovados.
- Validar acessibilidade, teclado/leitor de tela e UAT com Dispatchers.

## Gates de PRD

- Aprovação de arquitetura, segurança, identidade, jurídico/LGPD e responsáveis de operação.
- Carga com 100 mil atas/500 usuários representativos; definir throughput e p95.
- Isolamento HML/PRD, rede restrita, segredos rotacionados; nunca auth demo/seed.
- Retenção de atas/anexos/versões/outbox/logs/e-mails aprovada.
- Restore de PostgreSQL e Blob em HML, com RPO/RTO e rollback por digest documentados.
- Pipeline com aprovação obrigatória e migration controlada em agente de rede autorizado.
- Smoke tests sem envio a grupos reais; habilitar worker só após validar distribuição.
- Suporte e runbook de incidente/reconciliação com responsáveis definidos.

Não há declaração de prontidão para produção enquanto esses gates estiverem pendentes.