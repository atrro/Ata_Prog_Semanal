# Manual do Usuário

## Acesso e Painel

Abra http://localhost:3000. Ambiente demonstrativo com dados fictícios e usuário Ana Martins.
Não há login corporativo ativo na interface. Dados ficam no navegador, sem sincronização com a API.
Não utilize informações confidenciais.

O painel apresenta totais, tendência semanal, parques, atas recentes e últimos envios.
Filtre por região, parque e período. Percentuais com asterisco são ilustrativos; totais são calculados.
Clique no gráfico de parque para consultar suas atas. Sino abre pendências, lua/sol alterna tema.

## Criar e Revisar

1. Clique em Nova ata.
2. Preencha parque, território, semana, data, dispatcher e participantes.
3. Identifique supervisor, líder técnico, stock keeper, planejador e demais participantes.
4. Revise e marque os 13 itens do Checklist, inclusive os sem ocorrência após conferência.
5. Em Conteúdo, selecione seção e preencha com negrito, itálico ou listas quando útil.
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

Revisar e enviar abre pré-visualização. Informe destinatários por vírgula e confira assunto, corpo e anexos.
**Simular envio não envia e-mails reais**: registra somente um evento local.
A API suporta envio real após implantação/configuração, mas a interface não está conectada a ela nesta versão.
Download da tabela ou Exportar PDF no detalhe gera documento multipágina com participantes, checklist,
seções, links, nomes/versões dos anexos, identificador e data/hora. Arquivos não ficam embutidos no PDF.

## Histórico e Parques

Atas semanais: pesquisa e filtros de parque/status; Filtros abre semana, dispatcher, região e datas.
Menu da linha: visualizar, editar, duplicar, enviar/reenviar e excluir conforme perfil.
Duplicação cria rascunho; revise semana/data/conteúdo antes de compartilhar.
Exclusão demo é local e definitiva; API usa exclusão lógica com auditoria.

Parques eólicos: consulte cliente, capacidade, aerogeradores, região e gestor.
Administrador cadastra/edita; parques com atas vinculadas não podem ser excluídos.
Consultar atas abre histórico filtrado.

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