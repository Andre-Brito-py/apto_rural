/**
 * Central de ajuda: respostas prontas, sem IA (docs/central-de-ajuda.md). Cada resposta foi
 * escrita a partir do que o sistema faz de verdade; ao mudar uma regra ou uma tela, atualize
 * a resposta aqui também. Os números de preço ficam de fora de propósito: vêm do painel e
 * mudam; a resposta manda para a tela de Planos.
 */
export type CategoriaId =
  | 'comecar'
  | 'consulta'
  | 'arquivo'
  | 'resultado'
  | 'mapa'
  | 'dossie'
  | 'explicacao'
  | 'carteira'
  | 'lote'
  | 'creditos'
  | 'equipe'
  | 'conta'
  | 'bases';

export const CATEGORIAS: { id: CategoriaId; nome: string; resumo: string }[] = [
  { id: 'comecar', nome: 'Primeiros passos', resumo: 'O que é o Apto Rural e como começar' },
  { id: 'consulta', nome: 'Fazer uma consulta', resumo: 'Código do CAR, situação e módulos fiscais' },
  { id: 'arquivo', nome: 'Arquivo do imóvel', resumo: 'Shapefile, KML, GeoJSON e projeção' },
  { id: 'resultado', nome: 'Entender o resultado', resumo: 'Semáforo, itens do MCR e saídas' },
  { id: 'mapa', nome: 'Mapa', resumo: 'O que o mapa do entorno mostra' },
  { id: 'dossie', nome: 'Dossiê', resumo: 'O documento para levar ao banco' },
  { id: 'explicacao', nome: 'Explicação para o produtor', resumo: 'O texto em palavras simples' },
  { id: 'carteira', nome: 'Carteira e avisos', resumo: 'Acompanhar imóveis todo dia' },
  { id: 'lote', nome: 'Consulta em lote', resumo: 'Vários imóveis com uma planilha' },
  { id: 'creditos', nome: 'Créditos e pagamento', resumo: 'Planos, compra e assinatura' },
  { id: 'equipe', nome: 'Equipe', resumo: 'Plano Escritório, convites e papéis' },
  { id: 'conta', nome: 'Conta, senha e dados', resumo: 'Acesso, e-mail e LGPD' },
  { id: 'bases', nome: 'Bases oficiais e limites', resumo: 'De onde vêm os dados e o que não cobrimos' },
];

export interface LinkAjuda {
  rotulo: string;
  para: string;
}

export interface Pergunta {
  id: string;
  categoria: CategoriaId;
  pergunta: string;
  /** Um parágrafo por item. */
  resposta: string[];
  links?: LinkAjuda[];
  /** Outras palavras que as pessoas usam para a mesma dúvida (ajudam a busca). */
  palavras?: string[];
  /** Começos de endereço em que a pergunta aparece como sugestão (ex.: "/lote"). */
  telas?: string[];
}

export const PERGUNTAS: Pergunta[] = [
  // ---------------------------------------------------------------- Primeiros passos
  {
    id: 'o-que-e',
    categoria: 'comecar',
    pergunta: 'O que o Apto Rural faz?',
    resposta: [
      'Ele confere se um imóvel rural passa nos impedimentos socioambientais do crédito rural, do Manual de Crédito Rural (MCR, capítulo 2, seção 9), usando as mesmas bases oficiais que o banco consulta: Ibama, MMA, Funai, Incra, Serviço Florestal e Ministério do Trabalho.',
      'Você digita o código do CAR, envia o arquivo do contorno e recebe um semáforo item por item. Quando dá vermelho, o sistema mostra as saídas que a própria norma admite e monta o dossiê para levar ao banco.',
    ],
    links: [{ rotulo: 'Fazer uma consulta', para: '/consultar' }],
    palavras: ['para que serve', 'como funciona', 'o que e', 'sistema'],
    telas: ['/'],
  },
  {
    id: 'comecar',
    categoria: 'comecar',
    pergunta: 'Como eu começo a usar?',
    resposta: [
      '1. Crie sua conta e confirme o e-mail pelo link que mandamos. A confirmação libera a consulta grátis.',
      '2. Em "Consultar", digite o código do CAR e, se tiver, envie o arquivo do contorno do imóvel.',
      '3. Veja o resultado, gere o dossiê quando precisar e acompanhe o imóvel na carteira.',
      'Quer testar antes? Os botões de exemplo, no alto da tela de consulta, mostram resultados fictícios de graça.',
    ],
    links: [
      { rotulo: 'Criar conta', para: '/entrar?modo=criar' },
      { rotulo: 'Ir para a consulta', para: '/consultar' },
    ],
    palavras: ['primeira vez', 'iniciar', 'cadastro', 'comecar', 'tutorial'],
    telas: ['/', '/consultar', '/entrar'],
  },
  {
    id: 'gratis',
    categoria: 'comecar',
    pergunta: 'Tem consulta grátis?',
    resposta: [
      'Sim. Ao confirmar o e-mail da conta nova, você ganha 1 consulta grátis para checar um imóvel real.',
      'Os exemplos fictícios (botões "Embargo + Prodes", "Sem impedimento" etc.) são sempre grátis e não precisam de conta.',
    ],
    links: [{ rotulo: 'Criar conta grátis', para: '/entrar?modo=criar' }],
    palavras: ['gratuita', 'amostra', 'testar', 'de graca', 'teste'],
    telas: ['/', '/planos', '/entrar'],
  },
  {
    id: 'tour',
    categoria: 'comecar',
    pergunta: 'Como vejo o tour de apresentação de novo?',
    resposta: ['O tour mostra as principais funções em poucos passos. Para ver de novo, use o botão "Ver o tour de novo" aqui na Central de ajuda ou na página de ajuda.'],
    links: [{ rotulo: 'Página de ajuda', para: '/ajuda' }],
    palavras: ['tour', 'apresentacao', 'guia', 'passo a passo', 'mostrar funcoes'],
  },
  {
    id: 'celular',
    categoria: 'comecar',
    pergunta: 'Funciona no celular?',
    resposta: [
      'Sim. O site foi feito para o celular primeiro: dá para consultar, ver o mapa, gerar o dossiê e mandar o resultado no WhatsApp direto do campo.',
      'No celular, o menu fica no botão "Menu", no alto da tela.',
    ],
    palavras: ['smartphone', 'android', 'iphone', 'telefone', 'aplicativo', 'app'],
  },

  // ---------------------------------------------------------------- Consulta
  {
    id: 'codigo-car',
    categoria: 'consulta',
    pergunta: 'Onde encontro o código do CAR?',
    resposta: [
      'Está no recibo de inscrição do CAR e no demonstrativo do imóvel em consultapublica.car.gov.br.',
      'O formato é UF, código do município e 32 letras e números, por exemplo: MT-5104906-FAB0.83D0.E06E.4C88.BD6B.872B.C525.8FD2. Pode colar com ou sem os pontos.',
    ],
    links: [{ rotulo: 'Fazer uma consulta', para: '/consultar' }],
    palavras: ['recibo', 'numero do car', 'cadastro ambiental', 'onde acho'],
    telas: ['/consultar'],
  },
  {
    id: 'car-invalido',
    categoria: 'consulta',
    pergunta: 'O site diz que o código do CAR é inválido. O que faço?',
    resposta: [
      'Confira se o código tem as três partes: a sigla do estado (ex.: MT), os 7 números do município e as 32 letras e números do final. Letras de A a F e números de 0 a 9.',
      'Erros comuns: faltar um pedaço ao copiar, trocar a letra O pelo número 0, ou colar o número do recibo em vez do código do imóvel.',
    ],
    palavras: ['codigo errado', 'invalido', 'nao aceita', 'erro no car'],
    telas: ['/consultar', '/lote'],
  },
  {
    id: 'situacao-car',
    categoria: 'consulta',
    pergunta: 'Que situação do CAR eu marco?',
    resposta: [
      'A que aparece no demonstrativo do imóvel no Sicar: ativo, pendente, suspenso ou cancelado. CAR suspenso ou cancelado é impedimento para o crédito.',
      'Se não souber, marque "Não sei". Se o CAR estiver na lista do MMA, usamos a situação de lá; se não, o item fica "não verificado" até você informar.',
    ],
    links: [{ rotulo: 'Ver a consulta', para: '/consultar' }],
    palavras: ['ativo', 'pendente', 'suspenso', 'cancelado', 'demonstrativo', 'status do car'],
    telas: ['/consultar'],
  },
  {
    id: 'modulos-fiscais',
    categoria: 'consulta',
    pergunta: 'O que são os módulos fiscais e por que pedem?',
    resposta: [
      'Módulo fiscal é uma unidade de área fixada pelo Incra para cada município (de 5 a 110 hectares). O tamanho do imóvel em módulos fiscais define a partir de quando o banco passa a exigir a checagem de desmatamento (Prodes): 4/1/2027 para mais de 15 módulos, 1/7/2027 de 4 a 15 e 3/1/2028 até 4.',
      'Se você não informar, usamos a lista do MMA ou estimamos pela área do contorno dividida pelo módulo fiscal do município. Perto de 4 ou de 15 módulos, o resultado pede para conferir o número oficial no CAR.',
    ],
    palavras: ['modulo fiscal', 'mf', 'tamanho', 'hectares', 'incra', 'area'],
    telas: ['/consultar'],
  },
  {
    id: 'cpf-produtor',
    categoria: 'consulta',
    pergunta: 'Preciso informar o CPF ou CNPJ do produtor?',
    resposta: [
      'Não é obrigatório. Ele serve só para checar o cadastro de empregadores com trabalho análogo ao escravo, do Ministério do Trabalho, e exige a autorização do produtor.',
      'O número não fica salvo: guardamos só um código irreversível, conforme a LGPD. Sem o CPF/CNPJ, esse item fica "não verificado".',
    ],
    palavras: ['cpf', 'cnpj', 'trabalho escravo', 'documento', 'mte', 'empregador'],
    telas: ['/consultar'],
  },
  {
    id: 'consulta-demora',
    categoria: 'consulta',
    pergunta: 'Quanto tempo leva uma consulta?',
    resposta: ['Em geral, menos de 1 segundo. Imóveis muito grandes, com muitas áreas por perto, podem levar alguns segundos.'],
    palavras: ['demora', 'tempo', 'lento', 'rapido', 'carregando'],
  },
  {
    id: 'consulta-gasta',
    categoria: 'consulta',
    pergunta: 'A consulta gasta crédito? E se der erro?',
    resposta: [
      'Cada consulta de imóvel real usa 1 crédito de consulta. Os exemplos fictícios são grátis.',
      'Se a consulta falhar por um problema nosso, o crédito volta para a sua conta automaticamente.',
    ],
    links: [{ rotulo: 'Ver meus créditos', para: '/conta' }],
    palavras: ['credito', 'cobra', 'gastou', 'erro', 'devolve'],
    telas: ['/consultar'],
  },

  // ---------------------------------------------------------------- Arquivo do imóvel
  {
    id: 'formatos',
    categoria: 'arquivo',
    pergunta: 'Que arquivo do imóvel eu posso enviar?',
    resposta: [
      'Shapefile compactado em .zip (como sai do Sicar), KML ou GeoJSON. Até 25 MB para .zip e 5 MB para os outros.',
      'No .zip do Sicar, usamos a camada AREA_IMOVEL, que é o perímetro do imóvel. Depois de enviar, a tela mostra o desenho e a área para você conferir antes de consultar.',
    ],
    links: [{ rotulo: 'Enviar na consulta', para: '/consultar' }],
    palavras: ['shapefile', 'shp', 'zip', 'kml', 'geojson', 'arquivo', 'contorno', 'poligono', 'perimetro'],
    telas: ['/consultar', '/lote'],
  },
  {
    id: 'sem-arquivo',
    categoria: 'arquivo',
    pergunta: 'Posso consultar sem o arquivo do imóvel?',
    resposta: [
      'Pode, mas a checagem fica parcial: sem o contorno, não dá para cruzar o imóvel com embargos, terras indígenas, unidades de conservação e florestas públicas. Esses itens ficam "não verificado".',
      'Sem o arquivo, conferimos a lista do MMA (desmatamento e situação do CAR), que é feita pelo código do CAR.',
    ],
    palavras: ['sem shapefile', 'nao tenho arquivo', 'so o codigo', 'parcial'],
    telas: ['/consultar'],
  },
  {
    id: 'utm-prj',
    categoria: 'arquivo',
    pergunta: 'Apareceu "as coordenadas não estão em latitude e longitude". E agora?',
    resposta: [
      'O arquivo está em UTM (metros), comum em escritórios de topografia. No shapefile, inclua o arquivo .prj dentro do .zip: ele diz qual é a projeção, e o site converte sozinho.',
      'Se for KML ou GeoJSON, exporte de novo em latitude e longitude (SIRGAS 2000 ou WGS 84).',
    ],
    palavras: ['utm', 'prj', 'projecao', 'coordenadas', 'latitude', 'longitude', 'sirgas'],
    telas: ['/consultar', '/lote'],
  },
  {
    id: 'shapefile-erro',
    categoria: 'arquivo',
    pergunta: 'O site não consegue ler meu shapefile.',
    resposta: [
      'O .zip precisa ter juntos os arquivos .shp, .shx, .dbf e .prj do imóvel. Enviar só o .shp não funciona.',
      'Se o .zip tiver várias camadas e nenhuma se chamar AREA_IMOVEL, mande um .zip só com a camada do contorno do imóvel.',
    ],
    palavras: ['shapefile nao abre', 'erro no arquivo', 'nao le', 'camada', 'shx', 'dbf'],
    telas: ['/consultar', '/lote'],
  },
  {
    id: 'area-diferente',
    categoria: 'arquivo',
    pergunta: 'A área da prévia é diferente da do CAR. Está errado?',
    resposta: ['A área da prévia é uma conta aproximada do navegador, só para você conferir se mandou o imóvel certo (o erro costuma ser menor que 1%). A área oficial é sempre a do CAR.'],
    palavras: ['area errada', 'hectares diferente', 'previa'],
    telas: ['/consultar'],
  },

  // ---------------------------------------------------------------- Resultado
  {
    id: 'semaforo',
    categoria: 'resultado',
    pergunta: 'O que significa cada cor do resultado?',
    resposta: [
      'Vermelho, "Impedimento provável": o banco tende a negar com base no MCR. Veja o que foi encontrado e as saídas.',
      'Amarelo, "Atenção antes da proposta": nada impede hoje, mas há pontos que podem travar a análise.',
      'Verde, "Nenhum impedimento encontrado": nas bases consultadas, o imóvel passa.',
      'Cinza, "Checagem incompleta": nada foi encontrado, mas alguns itens não puderam ser conferidos. Complete os dados.',
    ],
    palavras: ['cores', 'vermelho', 'amarelo', 'verde', 'cinza', 'semaforo', 'veredito', 'impedimento', 'atencao'],
    telas: ['/consulta/'],
  },
  {
    id: 'nao-verificado',
    categoria: 'resultado',
    pergunta: 'Por que um item ficou "não verificado"?',
    resposta: [
      'Faltou um dado para conferir aquele item. Os motivos mais comuns são:',
      'sem o arquivo do contorno (embargos, terras indígenas, UCs, florestas públicas); sem a situação do CAR; sem o CPF/CNPJ do produtor (trabalho escravo); ou uma base oficial que não estava disponível no momento.',
      'Por segurança, o sistema nunca dá verde sem checar: na dúvida, o item fica "não verificado".',
    ],
    palavras: ['nao verificado', 'cinza', 'faltou', 'incompleto', 'sem dados'],
    telas: ['/consulta/'],
  },
  {
    id: 'itens-mcr',
    categoria: 'resultado',
    pergunta: 'Quais itens do MCR 2-9 o sistema confere?',
    resposta: [
      'Cadastro Ambiental Rural (situação do CAR), cadastro de empregadores (trabalho escravo), Unidades de Conservação, terras indígenas, territórios quilombolas, embargos ambientais do Ibama, florestas públicas não destinadas e supressão de vegetação após 31/7/2019 (lista do MMA, com dados do Prodes).',
      'Cada item mostra a norma, a base usada e a data em que ela foi atualizada.',
    ],
    links: [{ rotulo: 'Ver regras e fontes', para: '/fontes' }],
    palavras: ['itens', 'regras', 'mcr', 'manual de credito rural', 'o que confere', 'criterios'],
    telas: ['/consulta/', '/fontes'],
  },
  {
    id: 'borda',
    categoria: 'resultado',
    pergunta: 'O que é "sobreposição de borda"?',
    resposta: [
      'É quando uma área (embargo, terra indígena, UC…) encosta no imóvel com menos de 0,1 hectare. Isso costuma ser imprecisão no desenho do CAR, e o item sai como atenção, não como impedimento.',
      'A norma não prevê tolerância: o banco pode tratar como impedimento. Vale corrigir o desenho do CAR antes da proposta.',
    ],
    palavras: ['borda', 'divisa', 'encosta', 'pequena', 'sobreposicao'],
    telas: ['/consulta/'],
  },
  {
    id: 'saidas',
    categoria: 'resultado',
    pergunta: 'Deu impedimento. Tem como resolver?',
    resposta: [
      'Muitas vezes, sim. Para cada item, o resultado mostra as saídas que a própria norma admite (por exemplo: financiar só a recuperação da área embargada, provar que o embargo é de outro imóvel, autorização de supressão, contestação do Prodes no Inpe) e o que juntar.',
      'O dossiê organiza tudo isso num documento para levar ao banco.',
    ],
    palavras: ['resolver', 'saida', 'contestar', 'recorrer', 'regularizar', 'impedimento', 'embargo', 'embargado', 'deu embargo', 'deu vermelho', 'negado'],
    telas: ['/consulta/'],
  },
  {
    id: 'prodes-data',
    categoria: 'resultado',
    pergunta: 'O resultado fala do Prodes e de uma data. O que é isso?',
    resposta: [
      'O banco vai passar a conferir o desmatamento após 31/7/2019 (lista do MMA, com dados do Prodes/Inpe) em datas diferentes conforme o tamanho do imóvel: 4/1/2027 (mais de 15 módulos fiscais), 1/7/2027 (de 4 a 15) e 3/1/2028 (até 4), pela Resolução CMN 5.303/2026.',
      'Até a data do seu imóvel, constar na lista é atenção; depois, vira impedimento. Segundo o MMA, constar na lista não é, por si só, presunção de ilegalidade.',
    ],
    palavras: ['prodes', 'desmatamento', 'supressao', 'mma', 'lista do mma', '2027', '2028', 'inpe'],
    telas: ['/consulta/'],
  },
  {
    id: 'laudo',
    categoria: 'resultado',
    pergunta: 'O resultado vale como laudo ou aprovação do banco?',
    resposta: ['Não. É uma pré-checagem com bases públicas para você chegar ao banco preparado. Não é laudo técnico, parecer jurídico nem garantia de aprovação: a decisão é sempre da instituição financeira.'],
    palavras: ['laudo', 'garantia', 'aprovacao', 'vale', 'oficial', 'banco aceita'],
    telas: ['/consulta/'],
  },
  {
    id: 'whatsapp-pdf',
    categoria: 'resultado',
    pergunta: 'Como mando o resultado para o cliente?',
    resposta: [
      'No resultado, use "Enviar no WhatsApp" (vai um resumo com o link) ou "Salvar relatório em PDF".',
      'Para o produtor, a "Explicação para o produtor" escreve tudo em palavras simples, pronta para o WhatsApp.',
    ],
    palavras: ['whatsapp', 'pdf', 'imprimir', 'mandar', 'compartilhar', 'enviar'],
    telas: ['/consulta/'],
  },
  {
    id: 'qr',
    categoria: 'resultado',
    pergunta: 'Para que serve o código QR do relatório?',
    resposta: ['Ele abre a consulta original no site. O gerente do banco aponta a câmera e confere que o relatório é verdadeiro e de qual data é.'],
    palavras: ['qr', 'qr code', 'conferir', 'autenticidade', 'verificacao'],
    telas: ['/consulta/'],
  },

  // ---------------------------------------------------------------- Mapa
  {
    id: 'mapa',
    categoria: 'mapa',
    pergunta: 'O que o mapa do resultado mostra?',
    resposta: [
      'O contorno do imóvel e, em volta, as áreas das bases oficiais: embargos do Ibama, terras indígenas, Unidades de Conservação, territórios quilombolas e florestas públicas.',
      'O que encosta no imóvel ganha cor forte e um número, e a legenda diz quantos hectares ficam dentro. O que está perto aparece claro e tracejado, com a distância.',
      'O mapa é uma fotografia das bases no dia da consulta: o do dossiê mostra exatamente o que foi checado.',
    ],
    palavras: ['mapa', 'entorno', 'legenda', 'numeros', 'distancia', 'cores do mapa'],
    telas: ['/consulta/'],
  },
  {
    id: 'mapa-sumiu',
    categoria: 'mapa',
    pergunta: 'Por que a minha consulta não tem mapa?',
    resposta: ['O mapa precisa do arquivo do contorno do imóvel. Consultas feitas sem o arquivo, ou antes de o mapa existir, mostram só o resultado (ou só o desenho do imóvel).'],
    palavras: ['sem mapa', 'mapa nao aparece', 'sumiu o mapa'],
    telas: ['/consulta/'],
  },

  // ---------------------------------------------------------------- Dossiê
  {
    id: 'dossie',
    categoria: 'dossie',
    pergunta: 'O que é o dossiê e quando gerar?',
    resposta: [
      'É o documento para levar ao banco quando a consulta dá impedimento ou atenção. Ele reúne o que foi encontrado (com base, data e norma), o mapa, as saídas que a norma admite com o checklist de documentos e o código QR para o gerente conferir a consulta original.',
      'Gerar o dossiê usa 1 crédito de dossiê. Depois de gerado, dá para abrir quantas vezes quiser.',
    ],
    links: [{ rotulo: 'Ver planos e créditos', para: '/planos' }],
    palavras: ['dossie', 'documento', 'banco', 'contestacao', 'plano de saida', 'relatorio'],
    telas: ['/consulta/'],
  },
  {
    id: 'dossie-pdf',
    categoria: 'dossie',
    pergunta: 'Como salvo o dossiê em PDF?',
    resposta: ['No dossiê, clique em "Imprimir ou salvar em PDF" e escolha "Salvar como PDF" na janela do navegador. Sai só a folha do documento, sem os menus do site.'],
    palavras: ['salvar pdf', 'imprimir dossie', 'baixar dossie'],
    telas: ['/consulta/'],
  },

  // ---------------------------------------------------------------- Explicação
  {
    id: 'explicacao',
    categoria: 'explicacao',
    pergunta: 'O que é a "Explicação para o produtor"?',
    resposta: [
      'É um texto curto, em palavras simples, sobre o que deu, o que pesa e o que dá para fazer, pronto para mandar no WhatsApp.',
      'Ele é escrito a partir do resultado oficial: não muda nada do que as regras decidiram. Quando é feito por inteligência artificial, o texto é conferido automaticamente antes de aparecer. Gerado uma vez, fica guardado na consulta.',
    ],
    palavras: ['explicacao', 'produtor', 'texto simples', 'ia', 'inteligencia artificial', 'resumo'],
    telas: ['/consulta/'],
  },

  // ---------------------------------------------------------------- Carteira
  {
    id: 'carteira',
    categoria: 'carteira',
    pergunta: 'Como funciona a carteira?',
    resposta: [
      'No resultado de uma consulta, toque em "Acompanhar". Todo dia de manhã reconferimos os imóveis da carteira com as bases atualizadas. Se surgir um embargo, mudar a situação do CAR ou chegar a data do Prodes, você recebe um aviso no site e por e-mail.',
      'O número de imóveis na carteira depende do plano.',
    ],
    links: [
      { rotulo: 'Abrir a carteira', para: '/carteira' },
      { rotulo: 'Ver planos', para: '/planos' },
    ],
    palavras: ['carteira', 'acompanhar', 'monitorar', 'avisos', 'alerta', 'reconferir'],
    telas: ['/carteira', '/consulta/'],
  },
  {
    id: 'carteira-limite',
    categoria: 'carteira',
    pergunta: 'A carteira diz que está cheia. O que faço?',
    resposta: ['Cada plano tem um limite de imóveis acompanhados. Assine um plano maior ou tire da carteira um imóvel que não precisa mais acompanhar (menu "⋯" ao lado do imóvel).'],
    links: [{ rotulo: 'Ver planos', para: '/planos' }],
    palavras: ['carteira cheia', 'limite', 'nao consigo acompanhar', 'maximo'],
    telas: ['/carteira'],
  },
  {
    id: 'aviso-email',
    categoria: 'carteira',
    pergunta: 'Recebi um e-mail de mudança num imóvel. O que fazer?',
    resposta: ['Abra a carteira: as mudanças novas aparecem no alto, com o que mudou e o link para o resultado atualizado. Mudança causada só por uma base que falhou ao atualizar não gera aviso.'],
    links: [{ rotulo: 'Abrir a carteira', para: '/carteira' }],
    palavras: ['email de aviso', 'mudanca', 'mudou', 'alerta', 'notificacao'],
    telas: ['/carteira'],
  },

  // ---------------------------------------------------------------- Lote
  {
    id: 'lote',
    categoria: 'lote',
    pergunta: 'Como consulto vários imóveis de uma vez?',
    resposta: [
      'Use a Consulta em lote: envie uma planilha CSV com os códigos do CAR (até 200 por vez) e, se tiver, os arquivos de contorno, todos de uma vez. O site acha o contorno de cada imóvel pelo código do CAR no nome do arquivo ou na tabela de atributos.',
      'Antes de gastar, a tela mostra a lista e quantos créditos o lote usa. No fim, dá para baixar o resultado em planilha e pôr todos na carteira.',
    ],
    links: [{ rotulo: 'Abrir a consulta em lote', para: '/lote' }],
    palavras: ['lote', 'varios', 'planilha', 'csv', 'em massa', 'muitos imoveis', 'de uma vez'],
    telas: ['/lote', '/consultar', '/carteira'],
  },
  {
    id: 'lote-excel',
    categoria: 'lote',
    pergunta: 'Como salvo a planilha do Excel em CSV?',
    resposta: [
      'No Excel: Arquivo › Salvar como › escolha "CSV (separado por vírgulas)" ou "CSV UTF-8". O site entende o jeito que o Excel em português salva (ponto e vírgula, vírgula decimal e acentos).',
      'Só a coluna do CAR é obrigatória. Também dá para ter apelido, situação do CAR e módulos fiscais. Há uma planilha-modelo para baixar na tela do lote.',
    ],
    links: [{ rotulo: 'Abrir a consulta em lote', para: '/lote' }],
    palavras: ['excel', 'csv', 'xlsx', 'salvar como', 'modelo', 'colunas'],
    telas: ['/lote'],
  },

  // ---------------------------------------------------------------- Créditos e pagamento
  {
    id: 'creditos',
    categoria: 'creditos',
    pergunta: 'Como funcionam os créditos?',
    resposta: [
      'Há dois tipos: crédito de consulta (1 por imóvel consultado) e crédito de dossiê (1 por dossiê gerado). Você vê o saldo no alto da tela e em "Minha conta".',
      'Créditos vêm da compra avulsa ou da assinatura mensal, que renova os créditos todo mês.',
    ],
    links: [
      { rotulo: 'Ver planos', para: '/planos' },
      { rotulo: 'Minha conta', para: '/conta' },
    ],
    palavras: ['creditos', 'saldo', 'quanto tenho', 'consultas disponiveis'],
    telas: ['/planos', '/conta'],
  },
  {
    id: 'preco',
    categoria: 'creditos',
    pergunta: 'Quanto custa?',
    resposta: ['Os preços atualizados dos planos mensais e da compra avulsa (consulta e dossiê) estão na tela de Planos.'],
    links: [{ rotulo: 'Ver planos e preços', para: '/planos' }],
    palavras: ['preco', 'valor', 'custa', 'mensalidade', 'quanto e'],
    telas: ['/', '/planos'],
  },
  {
    id: 'pagamento',
    categoria: 'creditos',
    pergunta: 'Como eu pago? Aceita Pix?',
    resposta: [
      'Sim: Pix, cartão ou boleto, na página de pagamento do Asaas, um provedor de pagamentos. O Apto Rural não vê os dados do seu cartão.',
      'Pix e cartão liberam os créditos logo após a confirmação. O boleto, quando o banco compensa.',
    ],
    links: [{ rotulo: 'Ver planos', para: '/planos' }],
    palavras: ['pix', 'cartao', 'boleto', 'pagar', 'forma de pagamento', 'asaas'],
    telas: ['/planos'],
  },
  {
    id: 'creditos-nao-chegaram',
    categoria: 'creditos',
    pergunta: 'Paguei e os créditos não apareceram.',
    resposta: [
      'Pix e cartão costumam liberar em instantes; boleto, quando o banco compensa (até 3 dias úteis). Atualize a página e confira "Minha conta" › Compras.',
      'Se o pagamento foi confirmado e o crédito não entrou, fale com o suporte com o comprovante.',
    ],
    links: [{ rotulo: 'Minha conta', para: '/conta' }],
    palavras: ['paguei', 'nao chegou', 'credito nao apareceu', 'pagamento confirmado'],
    telas: ['/conta', '/planos'],
  },
  {
    id: 'cancelar-assinatura',
    categoria: 'creditos',
    pergunta: 'Como cancelo a assinatura?',
    resposta: ['Na tela de Planos, use "Cancelar assinatura". As próximas mensalidades não são cobradas, e os créditos que você já tem continuam seus.'],
    links: [{ rotulo: 'Ir para Planos', para: '/planos' }],
    palavras: ['cancelar', 'parar de pagar', 'assinatura', 'mensalidade'],
    telas: ['/planos', '/conta'],
  },

  {
    id: 'cupom',
    categoria: 'creditos',
    pergunta: 'Como uso um cupom de desconto?',
    resposta: [
      'Na tela de Planos, digite o código em "Tem um cupom de desconto?" e toque em Aplicar. Os preços com desconto aparecem em cada plano e produto em que o cupom vale. Se você recebeu um link com o cupom, ele já abre aplicado.',
      'Na assinatura, o cupom pode valer só nas primeiras mensalidades: a tela de Planos mostra quantas. Depois, a mensalidade volta sozinha ao valor normal. Cada cupom tem prazo e número de usos; se ele não valer mais, a tela explica o motivo.',
    ],
    links: [{ rotulo: 'Ir para Planos', para: '/planos' }],
    palavras: ['cupom', 'desconto', 'codigo promocional', 'promocao', 'voucher', 'cupom nao funciona'],
    telas: ['/planos'],
  },

  // ---------------------------------------------------------------- Equipe
  {
    id: 'equipe',
    categoria: 'equipe',
    pergunta: 'Como coloco outras pessoas do escritório?',
    resposta: [
      'No plano Escritório, o responsável convida pessoas por e-mail na tela Equipe. Todos usam os mesmos créditos e a mesma carteira.',
      'O convite vale por 7 dias. Quem recebe cria a conta pelo próprio link (o e-mail já vem preenchido).',
    ],
    links: [
      { rotulo: 'Abrir a equipe', para: '/equipe' },
      { rotulo: 'Ver o plano Escritório', para: '/planos' },
    ],
    palavras: ['equipe', 'convidar', 'escritorio', 'colegas', 'funcionarios', 'mais pessoas', 'usuarios'],
    telas: ['/equipe', '/planos'],
  },
  {
    id: 'papeis',
    categoria: 'equipe',
    pergunta: 'Qual a diferença entre responsável, administrador e técnico?',
    resposta: [
      'Responsável: é o dono da conta; compra créditos e planos e gerencia a equipe.',
      'Administrador: convida e tira pessoas e mexe na carteira, mas não compra.',
      'Técnico: consulta, gera dossiês e acompanha imóveis com os créditos da equipe.',
    ],
    links: [{ rotulo: 'Abrir a equipe', para: '/equipe' }],
    palavras: ['papeis', 'responsavel', 'administrador', 'tecnico', 'permissao', 'quem pode'],
    telas: ['/equipe'],
  },

  // ---------------------------------------------------------------- Conta
  {
    id: 'email-confirmacao',
    categoria: 'conta',
    pergunta: 'Não recebi o e-mail de confirmação.',
    resposta: [
      'Confira a caixa de spam e a aba "Promoções". O link vale por 48 horas.',
      'Para mandar de novo, use "Reenviar" na faixa amarela do alto do site, ou em "Minha conta".',
    ],
    links: [{ rotulo: 'Minha conta', para: '/conta' }],
    palavras: ['confirmacao', 'nao chegou', 'nao recebi', 'email', 'spam', 'reenviar', 'link', 'confirmar email'],
    telas: ['/conta', '/entrar'],
  },
  {
    id: 'esqueci-senha',
    categoria: 'conta',
    pergunta: 'Esqueci minha senha.',
    resposta: ['Na tela de entrar, use "Esqueci a senha" e digite seu e-mail. Mandamos um link para criar uma senha nova. O link vale por 1 hora e só pode ser usado uma vez.'],
    links: [{ rotulo: 'Recuperar a senha', para: '/esqueci-senha' }],
    palavras: ['esqueci', 'senha', 'recuperar', 'trocar senha', 'redefinir', 'nao lembro'],
    telas: ['/entrar'],
  },
  {
    id: 'nao-consigo-entrar',
    categoria: 'conta',
    pergunta: 'Não consigo entrar na minha conta.',
    resposta: [
      'Confira o e-mail e use o botão "Mostrar" para ver a senha que foi digitada. Depois de muitas tentativas erradas seguidas, o acesso fica bloqueado por uns 15 minutos, por segurança.',
      'Se não lembrar a senha, use "Esqueci a senha".',
    ],
    links: [{ rotulo: 'Recuperar a senha', para: '/esqueci-senha' }],
    palavras: ['nao entra', 'login', 'senha errada', 'bloqueado', 'acesso', 'entrar'],
    telas: ['/entrar'],
  },
  {
    id: 'senha-regras',
    categoria: 'conta',
    pergunta: 'Que senha posso usar?',
    resposta: ['Uma senha com pelo menos 10 caracteres. Frases curtas que você lembra (por exemplo, três palavras com um número) são seguras e fáceis de digitar no celular.'],
    palavras: ['senha', 'caracteres', 'regras', 'senha fraca'],
    telas: ['/entrar'],
  },
  {
    id: 'meus-dados',
    categoria: 'conta',
    pergunta: 'Como baixo meus dados ou excluo minha conta (LGPD)?',
    resposta: [
      'Em "Minha conta", na parte "Seus dados": "Baixar meus dados" gera um arquivo com tudo o que guardamos sobre você, e "Excluir minha conta" apaga a conta.',
      'A exclusão é definitiva. Compras e créditos ficam guardados pelo prazo que a lei manda, sem os seus dados pessoais.',
    ],
    links: [
      { rotulo: 'Minha conta', para: '/conta' },
      { rotulo: 'Privacidade', para: '/privacidade' },
    ],
    palavras: ['lgpd', 'excluir', 'apagar conta', 'meus dados', 'privacidade', 'deletar'],
    telas: ['/conta'],
  },
  {
    id: 'cpf-guardado',
    categoria: 'conta',
    pergunta: 'Vocês guardam o CPF do produtor?',
    resposta: ['Não. Quando você informa o CPF/CNPJ para checar o cadastro de empregadores, guardamos só um código irreversível (não dá para voltar ao número), conforme a LGPD.'],
    links: [{ rotulo: 'Privacidade', para: '/privacidade' }],
    palavras: ['cpf', 'privacidade', 'dados do produtor', 'seguranca'],
  },

  // ---------------------------------------------------------------- Bases
  {
    id: 'bases',
    categoria: 'bases',
    pergunta: 'De onde vêm os dados? São atualizados?',
    resposta: [
      'De bases públicas oficiais: embargos do Ibama, lista do MMA (Prodes), terras indígenas da Funai, Unidades de Conservação do MMA (CNUC), florestas públicas do Serviço Florestal, módulos fiscais do Incra e cadastro de empregadores do Ministério do Trabalho.',
      'Conferimos as bases todo dia de madrugada e recarregamos o que mudou. Cada item do resultado mostra a data de atualização da base usada.',
    ],
    links: [{ rotulo: 'Ver regras e fontes', para: '/fontes' }],
    palavras: ['fontes', 'bases', 'dados', 'atualizado', 'ibama', 'funai', 'mma', 'incra', 'oficial'],
    telas: ['/fontes', '/consulta/'],
  },
  {
    id: 'quilombolas',
    categoria: 'bases',
    pergunta: 'Por que territórios quilombolas aparecem como "não verificado"?',
    resposta: ['Porque não há uma base aberta e oficial dos territórios quilombolas titulados para consultar: o acervo do Incra exige login. Até existir uma fonte aberta, esse item fica "não verificado", e vale conferir com o Incra.'],
    palavras: ['quilombola', 'quilombo', 'incra', 'nao verificado'],
    telas: ['/consulta/'],
  },
  {
    id: 'sicar',
    categoria: 'bases',
    pergunta: 'Por que eu preciso informar a situação e o arquivo do CAR?',
    resposta: ['A consulta pública do Sicar é protegida por captcha, e o Apto Rural não contorna captcha. Por isso você informa a situação e envia o arquivo, que já tem. Buscar direto no Sicar só com autorização do Serviço Florestal Brasileiro.'],
    palavras: ['sicar', 'automatico', 'buscar sozinho', 'captcha', 'por que pedir'],
    telas: ['/consultar'],
  },
  {
    id: 'erro-dado',
    categoria: 'bases',
    pergunta: 'Achei um dado errado (por exemplo, um embargo que não é do imóvel).',
    resposta: [
      'O Apto Rural mostra o que está nas bases oficiais e não altera esses dados. Um embargo de outro imóvel ou um alerta de desmatamento errado é corrigido no órgão: termo do Ibama, contestação do Prodes no Inpe (Programa BiomasBR) etc.',
      'O resultado e o dossiê mostram a saída que a norma admite e o que juntar para o banco.',
    ],
    palavras: ['dado errado', 'erro na base', 'embargo errado', 'contestar', 'corrigir'],
    telas: ['/consulta/'],
  },
];
