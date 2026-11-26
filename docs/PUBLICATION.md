# Publicação com Atas Privadas

GitHub Pages hospeda somente a interface em `https://atrro.github.io/Ata_Prog_Semanal/`.
Supabase armazena atas, anexos e pastas. **Somente quem informar a senha de acesso compartilhada
consegue ler ou alterar esses dados.** A senha é verificada no banco (hash bcrypt em `wp_access`)
por funções RPC; não há login por conta GitHub, e a senha não fica no código nem no navegador.
Leitura anônima direta às tabelas é bloqueada por RLS.
O modo local sem variáveis de nuvem continua demonstrativo e independente da API NestJS.

## Configuração do Supabase

1. Crie ou abra o projeto em https://supabase.com/dashboard.
2. Execute `database/supabase-public.sql` por completo no SQL Editor. O script cria a tabela
   `wp_access`, as funções `wp_load_workspace`, `wp_set_access_password` e `save_wp_workspace`,
   e revoga leitura e escrita diretas para `anon` e `authenticated`. Pode ser reaplicado em
   projetos que usavam a versão anterior.
3. Defina a senha de acesso (mínimo de 12 caracteres). Substitua o marcador pela senha escolhida
   no momento; ela não deve ser gravada no repositório nem em arquivos de documentação:

```sql
select public.wp_set_access_password('<senha-de-acesso>');
```

Para trocar a senha depois, execute a mesma função com a nova senha. A função só roda no SQL
Editor (o papel `postgres`); clientes `anon` e `authenticated` não podem alterá-la.

4. O mesmo script cria as **54 pastas** com os nomes fornecidos, preservando maiúsculas,
   acentos e nomes completos. Não duplica pastas existentes com o mesmo nome nem remove atas.
   Faça backup antes de atualizar um projeto existente e feche sessões de edição durante a migração.
6. Em Authentication > URL Configuration, configure Site URL e Redirect URL como
   `https://atrro.github.io/Ata_Prog_Semanal/`.
5. Não é necessário configurar Authentication, OAuth ou provedores de login: o acesso é apenas pela senha.

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

Abra o site, informe a senha de acesso e clique em **Entrar**. Senha incorreta mostra
"Senha incorreta. Tente novamente." e não libera nenhuma ata. Com a senha correta, o workspace
abre com o botão **Nova ata**, no painel e em Atas semanais.

As pastas são os registros em **Parques eólicos**. Cada ata pertence à pasta selecionada no
campo **Parque eólico** (`parkId`); seus anexos ficam associados à mesma ata.
**Consultar atas** abre o histórico filtrado daquela pasta; **Nova ata** já seleciona a pasta.
Cliente, estado, gestor e capacidades ficam vazios/zero até serem informados pelo responsável,
sem dados operacionais fictícios. É possível complementar as pastas e cadastrar outras.

Salve e aguarde **Atas privadas na nuvem · revisão N** antes de sair.
Outra sessão da mesma conta recupera os registros salvos. Em erro de salvamento, exporte
as alterações antes de recarregar; logout é bloqueado enquanto há mudanças não publicadas.
Uma sessão encerrada remove os dados privados da tela.

Verifique também em janela anônima: somente a tela de senha deve aparecer, sem atas nem botão
de criação. Sem a senha correta, o histórico não é lido.

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

Envio de atas por e-mail permanece simulado. A senha compartilhada é o único acesso ao workspace privado.
O backend NestJS e suas integrações corporativas continuam independentes.
