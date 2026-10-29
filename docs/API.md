# Contrato REST

Base: `http://localhost:4000/api/v1`. Swagger local: `/api/docs`.
Swagger lista as rotas; os payloads Zod estão documentados aqui.
Produção exige `Authorization: Bearer <access_token>`, nunca ID token.
App roles: `Administrador`, `Dispatcher`, `Leitor`.

## Endpoints

| Método | Rota | Perfil |
|---|---|---|
| GET | `/health/live`, `/health/ready` | Público |
| GET | `/me` | Todos |
| GET | `/users` | Administrador |
| GET | `/parks` | Todos |
| POST | `/parks` | Administrador |
| PATCH, DELETE | `/parks/:id` | Administrador |
| GET | `/minutes` | Todos |
| GET | `/minutes/:id` | Todos |
| POST | `/minutes` | Dispatcher/Admin |
| PATCH | `/minutes/:id` | Dispatcher/Admin |
| DELETE | `/minutes/:id` | Administrador |
| POST | `/minutes/:id/duplicate` | Dispatcher/Admin |
| GET | `/minutes/:id/versions` | Todos |
| GET | `/minutes/:id/pdf` | Todos |
| POST | `/minutes/:id/send` | Dispatcher/Admin |
| GET | `/minutes/:id/deliveries` | Todos |
| GET | `/minutes/:id/attachments` | Todos |
| POST | `/minutes/:id/attachments` | Dispatcher/Admin |
| GET | `/minutes/:id/attachments/:fileId` | Todos |
| DELETE | `/minutes/:id/attachments/:fileId` | Dispatcher/Admin |
| POST | `/minutes/:id/ai` | Dispatcher/Admin |
| GET | `/dashboard` | Todos |

## Parque

Criação e atualização usam o mesmo payload completo:

```json
{
  "name": "Complexo Eólico Serra do Mel",
  "client": "Cliente corporativo",
  "region": "Nordeste",
  "state": "RN",
  "country": "BR",
  "capacity": 320,
  "turbines": 92,
  "manager": "Ricardo Almeida"
}
```

Não enviar empresa/ID/timestamps. Parque com qualquer histórico de atas não pode ser excluído.

## Ata

```json
{
  "parkId": "00000000-0000-4000-8000-000000000003",
  "week": 44,
  "date": "2026-10-29",
  "territory": "Nordeste",
  "dispatcher": "Ana Martins",
  "participants": "Supervisor: Ricardo\nPlanejador: Ana",
  "checklist": ["Conferência climática", "Backlog revisado"],
  "sections": [{"title": "Programação Semanal", "content": "<p>Manutenção preventiva.</p>"}],
  "links": [{"title": "Power BI", "url": "https://app.powerbi.com"}]
}
```

Rascunho permite checklist incompleto. Envio exige 13 itens, participantes e seção preenchida.
Semana 1–53, data civil ISO válida, links HTTP/HTTPS, títulos e conteúdo com limites de segurança.
UI permite blocos personalizados; API protege a requisição com máximo de 250 seções/100 mil caracteres por seção.
Limite de corpo HTTP também se aplica. Renderização de HTML deve usar parser/editor seguro.

Resposta: `id`, `company_id`, `park_id`, `week`, `meeting_date`, `dispatcher`, `status`,
`version`, `data` e timestamps. Editável fica em `data`.
GET individual retorna ETag com versão.
PATCH e DELETE de ata exigem `If-Match: "2"`.
PATCH recebe payload completo, volta a Rascunho e incrementa versão.
Duplicação copia conteúdo como rascunho, não copia arquivos.

## Consulta

```http
GET /api/v1/minutes?page=1&limit=20&week=44&region=Nordeste&status=Pendente&from=2026-10-01&to=2026-10-31
```

Opcionais: `parkId`, `week`, `dispatcher` exato, `region`, `status`, `from`, `to`, `search` por parque/dispatcher.
Resposta: `{ "items": [], "total": 0, "page": 1, "limit": 20 }`.
Máximo 100 por página; ordenação estável por data desc e ID.

## Anexos e PDF

Upload multipart campo `file`, `If-Match` obrigatório, até 15 MB API/2 MB UI demo.
Formatos PDF, XLSX, CSV, DOCX, PPTX, PNG, JPG/JPEG, com validação de assinatura.
Validação de ZIP não substitui scanner antimalware nem análise completa de OOXML.
Arquivo de mesmo nome gera nova versão. Resposta inclui `minuteVersion` para atualizar o cliente.
Exclusão de anexo é lógica, autenticada e exige versão corrente da ata.
Downloads privados retornam conteúdo e nome seguro.
Upload que perde uma corrida pode deixar Blob órfão; configurar limpeza por inventário.
PDF é gerado, salvo no Blob e retornado como `application/pdf`; inclui links e lista de anexos, não os arquivos embutidos.

## Envio

```http
POST /api/v1/minutes/{id}/send
Idempotency-Key: 00000000-0000-4000-8000-000000000099
Content-Type: application/json

{"version": 2, "recipients": ["equipe@example.com"]}
```

Retorno 202: `{ "id": "uuid-do-job", "state": "PENDING" }`.
Mesma chave no tenant retorna o mesmo job; não reutilizar para outra ata.
Estados: PENDING, PROCESSING, SENT, UNCERTAIN, CANCELLED.
SENT significa aceite Graph, não entrega na caixa final/leitura.
Até 2 MB de anexos no envio simples; documentos maiores devem ser links.
Sessões Graph de upload grande não estão implementadas.
Em timeout/falha, reconciliar `UNCERTAIN` por Sent Items/header `x-wind-planner-job`, sem reenviar cegamente.
Não existe endpoint administrativo de reconciliação nesta versão; seguir runbook restrito e auditado.

## IA e Erros

Body: `{ "mode": "risks" }`. Modos: `summary`, `correction`, `risks`, `recommendations`.
Resposta: `{ "text": "...", "humanReviewRequired": true }`.
Configurar Azure OpenAI aprovado e política de tratamento de dados antes de enviar conteúdo.
Resultado não substitui avaliação técnica/segurança.

400 dados inválidos (`errors[{field,message}]`), 401 token, 403 perfil/empresa,
404 inexistente, 409 versão/idempotência, 503 integração não configurada.