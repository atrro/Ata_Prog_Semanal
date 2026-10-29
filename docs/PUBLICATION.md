# Publicação Sem Cadastro Para Visitantes

## Endereços

- Site: https://atrro.github.io/Ata_Prog_Semanal/
- Código: https://github.com/atrro/Ata_Prog_Semanal
- Publicação: https://github.com/atrro/Ata_Prog_Semanal/actions/workflows/pages.yml

Se o GitHub Pages ainda não estiver ativo, abra Settings > Pages no repositório e selecione
**GitHub Actions** como Source. O token do Codespaces pode permitir push, mas não permitir ativar Pages;
nesse caso, esta etapa precisa ser feita pelo proprietário na interface do GitHub.
Depois, abra Actions > Publish Wind Planner > Run workflow.

GitHub Pages hospeda o site gratuitamente conforme os limites do serviço. Supabase hospeda os dados.
Visitantes não criam conta nem fazem login. Só o responsável precisa configurar o serviço uma vez
e autenticar-se para publicar alterações. Não há servidor pago ou container Azure obrigatório nesse modo.
Custos, limites e eventual pausa por inatividade dependem do plano escolhido; não existe promessa de gratuidade ilimitada.

## Configuração Inicial Pelo Responsável

1. Acesse https://supabase.com/dashboard e crie um projeto, usando sua conta GitHub se preferir.
2. No SQL Editor desse projeto, execute uma vez o conteúdo de `database/supabase-public.sql`.
3. Em Authentication > Users, use Add user para cadastrar somente o e-mail do responsável.
   Não habilite cadastro público. Copie o UUID desse usuário e execute no SQL Editor:

```sql
INSERT INTO public.wp_admins(user_id)
VALUES ('UUID-DO-USUARIO-RESPONSAVEL')
ON CONFLICT DO NOTHING;
```

4. Em Authentication > URL Configuration, configure Site URL e Redirect URL exatamente como:
   `https://atrro.github.io/Ata_Prog_Semanal/`.
5. Em Authentication, mantenha Email/Magic Link habilitado e desative novos cadastros.
   O SDK usa `shouldCreateUser: false`. Configure SMTP próprio se os limites de e-mail do plano exigirem.
   O remetente embutido pode restringir destinatários aos membros da organização Supabase.
6. No GitHub, abra Settings > Secrets and variables > Actions > **Variables** e cadastre:

| Nome | Valor |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Project URL do Supabase, HTTPS |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Publishable key, ou chave anon legada |

Esses dois valores são públicos por projeto e são incluídos no JavaScript do site.
**Nunca use secret key, service_role, senha do banco ou access token nesse lugar.**
A segurança dos dados depende de RLS, privilégios e função autorizada, não de esconder a publishable key.

7. Abra Actions > Publish Wind Planner > Run workflow e aguarde os jobs build/deploy.
8. No site, clique em Responsável, informe o e-mail cadastrado e abra o link recebido.
9. Cadastre os parques e atas que podem ser divulgados. Aguarde o painel confirmar a revisão na nuvem.
10. Abra o mesmo site em janela anônima: os dados devem aparecer sem login e sem botões de edição.

Não é necessário informar tokens, senhas ou chaves privadas ao assistente.
Sem a configuração acima, o site mostra “Armazenamento em nuvem ainda não configurado” e não finge salvar dados.

## Comportamento e Proteções

- Modo público é ativado no build do GitHub Pages; ignoramos dados antigos do localStorage.
- Não ocorre importação/publicação automática de atas ou anexos locais.
- Visitantes têm leitura anônima apenas da publicação atual, sem acesso ao histórico administrativo.
- Somente usuários cadastrados na tabela privada `wp_admins` gravam pela função autorizada.
- Alterar permissões ou estado no DevTools não autoriza gravação no banco.
- Revisão otimista impede sobrescrita silenciosa por outra sessão; o conflito preserva alterações na tela.
- Em erro, exporte seu trabalho antes de recarregar. Não é feita gravação local disfarçada de cloud.
- Anexos fazem parte dos dados públicos; qualquer visitante poderá baixá-los.
- Logout é bloqueado enquanto há alterações não publicadas. Evite uso em computador compartilhado.
- Atualizar consulta a versão corrente no banco; não há sincronização por websocket nesta versão.
- O modo local de desenvolvimento continua disponível sem variáveis de nuvem, com dados fictícios.

## Limites Deste Modo

O perfil público usa snapshot JSONB com controle de revisão e histórico privado no PostgreSQL Supabase.
É adequado a uma publicação pequena, não ao objetivo original de 100 mil atas ou múltiplos editores simultâneos.
Limite de 20 MB no documento completo; arquivos continuam limitados a 2 MB cada na interface.
Para grandes históricos e anexos, migrar a publicação para tabelas por entidade e Storage privado/público
com política por documento. Backups e quotas devem ser administrados pelo responsável.
O backend NestJS corporativo permanece independente e não precisa ser exposto ao público.
Envio de e-mail de atas continua simulado; autenticação por e-mail do responsável é um fluxo diferente.

## Segurança de Publicação

Tudo publicado é acessível na internet sem conta, inclusive participantes, nomes, links e anexos.
Não publique dados operacionais internos da Vestas, informações pessoais, segredos ou documentos de clientes
sem autorização explícita. Um link não indexado não é controle de acesso.
Para conteúdo confidencial, use acesso corporativo autenticado, não este perfil público.