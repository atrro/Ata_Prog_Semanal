# App da Empresa no Render

O modo **company** usa uma senha compartilhada validada no servidor e armazena atas e
anexos no repositório privado `atrro/base_de_dados`, em `data/workspace.json`.
As 54 pastas já estão inicializadas. Não há Supabase, banco de dados, login individual
ou token GitHub no navegador. O Render hospeda a interface e o servidor no mesmo endereço HTTPS.

**A implantação ainda exige autorização inicial do responsável.** Entre no Render com
sua conta GitHub existente; não é preciso criar outra credencial de login. Isso cria o
vínculo de hospedagem no Render, sujeito aos termos e limites do serviço. O assistente
não pode autorizar esse vínculo nem inventar credenciais.

## Ativar

1. Acesse https://dashboard.render.com e escolha entrar com GitHub. Autorize acesso ao
   repositório de código `atrro/Ata_Prog_Semanal`.
2. Crie um **Blueprint** desse repositório, usando `render.yaml` na branch `main`.
   O blueprint usa Docker, não cria banco e propõe o plano gratuito. Se o plano não estiver
   disponível para sua conta, confirme custos antes de escolher qualquer plano pago.
3. No GitHub, abra Settings > Developer settings > Personal access tokens >
   Fine-grained tokens e gere uma credencial **de serviço**, somente para
   `atrro/base_de_dados`, com **Contents: Read and write**. Não conceda acesso a todos os
   repositórios. Defina validade e substitua o token antes de expirar.
   O token vai somente no servidor Render; ninguém da equipe precisa de token ou conta GitHub.
4. Preencha os campos secretos solicitados pelo Blueprint:

| Campo | Valor |
|---|---|
| COMPANY_PASSWORD | Uma nova senha compartilhada forte, de 12 a 200 caracteres |
| GITHUB_DATA_TOKEN | Token restrito do passo anterior |

`SESSION_SECRET` é gerado automaticamente pelo Render.
`GITHUB_DATA_REPOSITORY` já aponta para `atrro/base_de_dados`.
O servidor usa `RENDER_EXTERNAL_URL` para validar a origem; caso use domínio próprio,
configure também `APP_ORIGIN=https://seu-dominio`, sem barra final.

**Não envie os segredos nesta conversa, não coloque no código e não use variáveis
NEXT_PUBLIC para eles.** A antiga senha de demonstração não é usada no servidor.

5. Conclua a criação e aguarde `/healthz` responder com `{"ready":true}`.
   Abra o endereço HTTPS fornecido pelo Render, não o endereço GitHub Pages.
6. Informe a senha da empresa. Confirme que as 54 pastas aparecem e crie uma ata de teste.
   Aguarde **Atas privadas na nuvem · revisão N**. Em outro navegador, entre com a mesma
   senha e confira a ata; sem senha, o endpoint `/cloud/workspace` deve retornar 401.
7. Compartilhe somente o endereço Render e a senha por canal interno autorizado.

O código está pronto para deploy, mas publicar código no GitHub **não ativa o Render**.
O GitHub Pages continua sendo uma implantação separada; não hospeda o servidor company.

## Acesso e Operação

- Quem conhece a senha pode consultar, criar, editar e excluir atas. A senha **não comprova
  vínculo com a empresa**; não é SSO, MFA ou controle individual de colaborador.
- A sessão usa cookie HttpOnly/Secure/SameSite=Strict e expira em oito horas.
  **Sair** limpa a sessão daquele navegador. Alterar `COMPANY_PASSWORD` ou `SESSION_SECRET`
  e reiniciar/reimplantar revoga todas as sessões.
- O servidor exige origem autorizada nas operações que alteram estado e limita tentativas
  de login a 30 por 15 minutos, somadas para o serviço. Use uma única instância; o limitador
  é em memória e reinícios o zeram. Para uso corporativo maior, adote identidade individual
  e proteção adicional contra ataques no provedor.
- Cada salvamento gera um commit do snapshot. Revisão e SHA impedem sobrescrita silenciosa
  entre pessoas; em conflito, exporte as alterações e atualize antes de continuar.
- Atas são agrupadas pelo `parkId`. As pastas `atas/<nome>` estão pré-criadas, mas o app
  grava atas e anexos **no snapshot**, não como PDFs separados nessas pastas.
  PDFs são gerados para download pelo navegador.
- O snapshot tem limite de 20 MB; anexos, 2 MB por arquivo na interface.
  Git não é banco de dados: versões com anexos aumentam o histórico e consomem quotas.
  Este modo atende pequenos volumes, não 100 mil atas nem centenas de editores simultâneos.
- O servidor verifica se o repositório continua privado antes de ler/gravar. Não torne
  o repositório público: isso exporia o histórico já existente, independentemente da senha.
- Excluir uma ata do app **não apaga versões anteriores do histórico Git**. Defina uma
  política de retenção e remoção definitiva com o administrador antes de inserir dados pessoais.
- O plano gratuito pode suspender o serviço por inatividade e levar tempo para reativar.
  O armazenamento permanece no GitHub; não depende do disco efêmero do Render.
  Disponibilidade, limites e custos dependem dos serviços, sem promessa de gratuidade permanente.
- Envio de atas por e-mail continua simulado. O modo company não envia links de login.
- Use armazenamento e hospedagem aprovados pela empresa antes de inserir dados internos.

## Verificar o Código

```bash
npm run typecheck -w apps/web
npm test -w apps/web
npm run test:company-server
npm run test:company-ui
docker build -f apps/web/Dockerfile.render -t wind-planner-company .
```

Não passe segredos como argumentos de build. Eles só são necessários na execução do serviço.
