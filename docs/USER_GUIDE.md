# Manual do Usuário

## Acesso e Painel

Site publicado no GitHub Pages: informe a **senha de acesso** e clique em **Entrar**.
A senha é verificada no servidor do Supabase; o site não guarda a senha.
Atas e anexos são salvos no Supabase privado. Em falha de salvamento aparece um aviso; use o ícone
de download no topo para exportar um backup JSON antes de sair.
Use o ícone **Sair** no topo ao terminar, principalmente em computadores compartilhados.
Veja [Publicação e nuvem](PUBLICATION.md) para configuração e limites.

No site publicado, informe a senha de acesso e clique em **Entrar**.
Depois de autenticar, **Nova ata** fica disponível no painel e em Atas semanais.
As 54 pastas pré-criadas aparecem em **Parques eólicos**; selecione a pasta no campo
**Parque eólico** da ata. **Consultar atas** filtra o histórico por pasta e a seleciona
ao criar uma ata. Atas e anexos ficam privados na nuvem Supabase. Outras contas e visitantes não têm acesso.
Veja a configuração e os limites em [Publicação](PUBLICATION.md).

As orientações sobre dados fictícios, perfis e armazenamento local abaixo se aplicam
somente ao ambiente demonstrativo, sem variáveis Supabase.

Abra http://localhost:3000. Ambiente demonstrativo com dados fictícios e usuário Ana Martins.
Não há login corporativo ativo na interface. Dados ficam no navegador, sem sincronização com a API.
Não utilize informações confidenciais.

O painel apresenta totais, tendência semanal, parques, atas recentes e últimos envios.
Filtre por região, parque e período. Percentuais com asterisco são ilustrativos; totais são calculados.
Clique no gráfico de parque para consultar suas atas. Sino abre pendências, lua/sol alterna tema.

## Criar e Revisar

1. Clique em Nova ata.
2. Preencha parque, ano, semana, data, dispatcher (suas iniciais) e participantes.
   Para repetir o planejamento anterior, use **Iniciar a partir da última ata**: carrega participantes,
   dispatcher, conteúdo, links e anexos da última ata do parque, avança a semana e deixa o checklist para refazer.
3. Identifique supervisor, líder técnico, stock keeper, planejador e demais participantes.
4. Revise e marque os 13 itens do Checklist, inclusive os sem ocorrência após conferência.
5. Em Conteúdo, selecione seção e preencha com negrito, itálico, listas e tabelas. Cole imagens com Ctrl+V.
6. Acrescente blocos por nome para Segurança, Logística, Cliente ou outros temas.
7. Inclua Anexos e links.
8. Salve rascunho para continuar depois ou use Revisar e enviar.

Envio exige checklist completo, participantes e ao menos uma seção preenchida.
Aba Histórico mostra versão, autor, data e ação registrada em cada salvamento.

## Anexos e Links

PDF, XLSX, CSV, DOCX, PPTX, PNG e JPG; até 2 MB por arquivo na demonstração.
Clique no nome para preview de imagem/PDF. Outros formatos são baixados para abrir no aplicativo de origem.
Download pelo ícone; lixeira remove antes de salvar. Mesmo nome cria nova versão local.
Links exigem título e endereço HTTP/HTTPS e abrem no serviço original, sujeito às permissões do destino.

## Enviar e Exportar

**Revisar e enviar** salva a ata e gera um rascunho de e-mail (arquivo `.eml`) com a ata completa em HTML
no corpo (imagens incluídas), o PDF da ata e os anexos do app. Abra o arquivo baixado no Outlook para
revisar, informar os destinatários e enviar. O Outlook novo e o Outlook na web não abrem `.eml` como rascunho:
use o menu da linha > **Enviar ata** > **Outlook Web**, que copia o corpo, baixa os arquivos e abre o e-mail
(cole com Ctrl+V e anexe os arquivos baixados). O envio é feito por você no Outlook; o app não envia e-mails.
**Exportar HTML** (menu da linha ou detalhe) baixa a ata com todas as informações e imagens, e
**Copiar para e-mail** copia o mesmo conteúdo para colar no corpo de qualquer e-mail.
**Exportar PDF** gera o documento no padrão Vestas (cabeçalho, participantes, seções com imagens,
checklist, links e anexos); anexos em PNG/JPG aparecem no PDF e os demais são listados.

## Histórico e Parques

Atas semanais: pesquisa e filtros de parque/status; Filtros abre semana, dispatcher e datas.
Menu da linha: visualizar, exportar HTML, copiar para e-mail, editar, duplicar, enviar/reenviar e excluir conforme perfil.
Duplicação cria rascunho; revise semana/data/conteúdo antes de compartilhar.
Exclusão demo é local e definitiva; API usa exclusão lógica com auditoria.

Parques eólicos: lista com estado, modelo de turbina, aerogeradores e quantidade de atas.
**Consultar atas** abre o histórico filtrado do parque.

## Equipe, Relatórios e Configurações

Equipe lista usuários fictícios. Perfil de demonstração em Configurações permite avaliar restrições:
Administrador gerencia/exclui, Dispatcher cria/edita/envia, Leitor consulta/exporta.
Isso não altera roles no Entra; autorização real é feita pelo token da API.
Relatórios reúne linhas, barras e pizza por parque, dispatcher e região.
Integrações mostra requisitos, não conexões ativas.
Resumo e riscos executa análise local simples, identificada como tal; exige revisão humana.

Tema e atas persistem no navegador. Perfil demo dura até recarregar.
Organização/idioma/fuso ainda não possuem persistência própria de workspace.
Idiomas ainda não traduzidos ficam desabilitados.
Exportar dados locais baixa backup JSON; importação/restauração pela UI ainda não existe.
Limpar o navegador remove os registros locais. Exporte antes e evite anexos grandes.