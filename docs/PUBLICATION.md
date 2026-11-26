# Publicação com Atas Privadas

GitHub Pages hospeda somente a interface em `https://atrro.github.io/Ata_Prog_Semanal/`.
Supabase armazena atas, anexos e pastas. **Somente a conta GitHub responsável pode ler e alterar
esses dados**, mediante login com GitHub (OAuth) pelo Supabase Auth. Não existe consulta anônima,
e a senha da conta GitHub nunca é informada ao app.
O modo local sem variáveis de nuvem continua demonstrativo e independente da API NestJS.

## Configuração do Supabase

1. Crie ou abra o projeto em https://supabase.com/dashboard.
2. Em GitHub, crie um OAuth App (Settings > Developer settings > OAuth Apps) com
   **Authorization callback URL** `https://<project-ref>.supabase.co/auth/v1/callback`.
   Em Supabase, Authentication > Sign In / Providers > GitHub, ative o provedor e informe o
   Client ID e o Client Secret do OAuth App. Esses segredos ficam somente nos painéis do GitHub
   e do Supabase; não os envie ao assistente nem ao repositório.
3. Execute `database/supabase-public.sql` por completo. Apesar do nome legado, o script
   configura **acesso privado**. Pode ser reaplicado em projetos que usavam leitura pública:
   remove a política pública, revoga leitura anônima e restringe a leitura à conta responsável.
   O índice `wp_single_admin` impede cadastrar uma segunda conta responsável, inclusive pelo
   SQL Editor.
4. Para configurar a única conta responsável, informe o nome de usuário do GitHub em minúsculas:

```sql
BEGIN;
DELETE FROM public.wp_admins;
INSERT INTO public.wp_admins(github_login) VALUES('atrro');
COMMIT;
```

O login é o nome de usuário do GitHub, não e-mail nem nome de exibição. A permissão vale somente
para a identidade GitHub vinculada à conta autenticada no Supabase; e-mail e metadados editáveis
não concedem acesso. O `DELETE` substitui o responsável anterior; não exclui usuários nem atas.
Não envie senhas, tokens ou chaves privadas ao assistente.

5. O mesmo script cria as **54 pastas** com os nomes fornecidos, preservando maiúsculas,
   acentos e nomes completos. Não duplica pastas existentes com o mesmo nome nem remove atas.
   Faça backup antes de atualizar um projeto existente e feche sessões de edição durante a migração.
6. Em Authentication > URL Configuration, configure Site URL e Redirect URL como
   `https://atrro.github.io/Ata_Prog_Semanal/`.
7. Em Authentication > Sign In / Providers, mantenha somente o provedor GitHub habilitado se não
   houver outro uso do projeto. Mesmo com login aberto, contas sem permissão não leem nem gravam dados.

## Publicação da Interface

Em Settings > Secrets and variables > Actions > **Variables**, cadastre:

| Nome | Valor |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Project URL HTTPS do Supabase |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Publishable key ou chave anon legada |

Os dois valores são públicos e incluídos no JavaScript. **Nunca use secret key, service_role,
senha do banco ou access token.** A proteção dos dados é feita por RLS e privilégios no banco,
não por esconder a URL ou a chave pública.

Em Settings > Pages, selecione **GitHub Actions** como Source. Execute Actions >
Publish Wind Planner > Run workflow. O workflow usa `NEXT_PUBLIC_ACCESS_MODE=private`.
Aplique as políticas no Supabase **antes** de publicar a interface: atualizar o frontend sozinho
não remove o acesso direto anteriormente permitido pelo banco.

Sem URL/chave, o app informa que a nuvem não foi configurada; não salva dados locais como se
estivessem na nuvem. A configuração do projeto Supabase exige acesso administrativo ao serviço.

## Entrar, Criar e Consultar

Abra o site e clique em **Entrar com GitHub**. Autorize o OAuth App quando solicitado.
Depois da validação da sessão e das permissões, o workspace abre com o botão **Nova ata**,
no painel e em Atas semanais. Uma conta GitHub sem permissão vê a mensagem de acesso não autorizado.
A antiga senha compartilhada não concede acesso ao workspace na nuvem.

As pastas são os registros em **Parques eólicos**. Cada ata pertence à pasta selecionada no
campo **Parque eólico** (`parkId`); seus anexos ficam associados à mesma ata.
**Consultar atas** abre o histórico filtrado daquela pasta; **Nova ata** já seleciona a pasta.
Cliente, estado, gestor e capacidades ficam vazios/zero até serem informados pelo responsável,
sem dados operacionais fictícios. É possível complementar as pastas e cadastrar outras.

Salve e aguarde **Atas privadas na nuvem · revisão N** antes de sair.
Outra sessão da mesma conta recupera os registros salvos. Em erro de salvamento, exporte
as alterações antes de recarregar; logout é bloqueado enquanto há mudanças não publicadas.
Uma sessão encerrada remove os dados privados da tela.

Verifique também em janela anônima: somente a tela de login com GitHub deve aparecer,
sem atas nem botão de criação. Outra conta GitHub autenticada não deve ler o workspace ou histórico.

## Armazenamento e Limites

Pastas são agrupamentos lógicos no snapshot JSONB do PostgreSQL Supabase, **não diretórios
do OneDrive/SharePoint nem objetos de um bucket Storage**. Atas e anexos são persistidos
na nuvem dentro desse snapshot; o PDF é gerado para download, não automaticamente armazenado
como um arquivo separado. Não há importação automática de dados antigos do navegador.

O documento completo tem limite de 20 MB; cada anexo tem limite de 2 MB na interface.
Histórico privado e controle de revisão evitam sobrescrita silenciosa por outra sessão.
Atualizar consulta a versão corrente; não há sincronização por websocket.
Para grandes históricos, use tabelas por entidade e Storage privado com políticas próprias.
Backups, quotas, recuperação e autorização corporativa do uso do serviço devem ser administrados
pelo responsável. Não há promessa de armazenamento gratuito ilimitado.

Envio de atas por e-mail permanece simulado. Login GitHub é o único acesso ao workspace privado.
O backend NestJS e suas integrações corporativas continuam independentes.
