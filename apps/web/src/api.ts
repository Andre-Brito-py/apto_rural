import type { FonteId, Fonte, Norma, ResultadoConsulta, SituacaoCar, Status } from '@apto/regras';

export interface GeometriaImovel {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export type TipoCamadaMapa = 'embargo' | 'terra_indigena' | 'uc' | 'quilombola' | 'floresta_publica';

/** Uma área das bases públicas no mapa do entorno (recorte guardado no dia da consulta). */
export interface CamadaMapa {
  tipo: TipoCamadaMapa;
  nome: string;
  detalhe?: string;
  /** Encosta no imóvel. */
  toca: boolean;
  /** Hectares dentro do imóvel, quando encosta. */
  areaHa?: number;
  /** Metros até o imóvel, quando não encosta. */
  distanciaM?: number;
  rotulo?: [number, number];
  geometria: { type: string; coordinates?: unknown; geometries?: CamadaMapa['geometria'][] };
}

export interface MapaEntorno {
  /** Oeste, sul, leste, norte. */
  janela: [number, number, number, number];
  camadas: CamadaMapa[];
}

export interface ConsultaSalva {
  id: string;
  criadaEm: string;
  resultado: ResultadoConsulta;
  geometria?: GeometriaImovel;
  /** Mapa do entorno; ausente em consultas sem contorno ou anteriores ao mapa. */
  mapa?: MapaEntorno;
  /** Explicação para o produtor, quando já foi gerada pela IA. */
  explicacao?: Explicacao;
  demo: boolean;
  /** A consulta é de quem está logado. */
  minha: boolean;
  dossieLiberado: boolean;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  whatsapp?: string;
  profissao?: string;
  emailConfirmado: boolean;
  /** Já viu (ou pulou) o tour de boas-vindas. */
  tourVisto?: boolean;
  /** Verificação em duas etapas (aplicativo autenticador) ligada. */
  doisFatores?: boolean;
  /** Tem senha (conta criada pelo Google não tem, até criar uma). */
  temSenha?: boolean;
  /** Entra também com a conta Google. */
  comGoogle?: boolean;
}

export interface Saldo {
  consulta: number;
  dossie: number;
}

export interface Sessao {
  usuario: Usuario;
  saldo: Saldo;
  /** Acesso ao painel: admin altera; suporte só vê e entra como. */
  nivelAdmin?: 'admin' | 'suporte' | null;
  /** Tem papel no painel, mas precisa entrar de novo (login com mais de 12 h) ou ligar a verificação em duas etapas. */
  bloqueioPainel?: 'reentrar' | 'dois_fatores' | null;
  /** Em produção, o painel exige a verificação em duas etapas desta conta. */
  doisFatoresObrigatorio?: boolean;
  /** Preenchido no modo "entrar como" (só leitura). */
  personificadoPor?: { nome: string; email: string };
  /** Quem está numa equipe usa o saldo e a carteira do responsável. */
  equipe?: { papel: PapelEquipe; donoNome: string };
}

export type Papel = 'usuario' | 'suporte' | 'admin';

export interface FichaUsuario {
  usuario: {
    id: string;
    nome: string;
    email: string;
    whatsapp?: string;
    profissao?: string;
    papel: Papel;
    criadoEm: string;
    confirmadoEm: string | null;
    bloqueadoEm: string | null;
    bloqueioMotivo?: string;
    doisFatores?: boolean;
  };
  saldo: Saldo;
  lancamentos: { tipo: string; quantidade: number; motivo: string; criadoEm: string }[];
  consultas: { id: string; codCar: string; criadaEm: string; veredito: string }[];
  carteira: { id: string; codCar: string; apelido?: string; verificadoEm: string; veredito: string; ultimaConsultaId?: string }[];
  pedidos: { id: string; produto: string; valor: number; status: string; criadoEm: string }[];
  auditoria: { quando: string; acao: string; detalhes: Record<string, unknown>; adminEmail: string }[];
  assinaturas: {
    id: string;
    nomePlano: string;
    valorMensal: number;
    ciclo?: CicloAssinatura;
    validaAte?: string | null;
    status: Assinatura['status'];
    criadaEm: string;
    ativadaEm: string | null;
    canceladaEm: string | null;
    mesesPagos: number;
  }[];
}

export interface RegistroAuditoria {
  quando: string;
  acao: string;
  detalhes: Record<string, unknown>;
  adminEmail: string;
  alvoEmail?: string;
  alvoId?: string;
}

export interface PainelResumo {
  resumo: {
    usuarios: number;
    confirmados: number;
    usuarios7d: number;
    consultasHoje: number;
    consultas7d: number;
    consultas30d: number;
    receita30d: number;
    receitaTotal: number;
    pedidosPendentes: number;
    creditosEmCirculacao: Saldo;
    imoveisCarteira: number;
    avisos7d: number;
    erros24h: number;
    assinantes: number;
    inadimplentes: number;
    receitaRecorrente: number;
  };
  bases: {
    fonteId: string;
    nome: string;
    registros: number | null;
    referencia: string | null;
    conferidoEm: string | null;
    diasSemConferir: number | null;
    situacao: 'em_dia' | 'atrasada' | 'nao_carregada';
  }[];
  /** Backup e vigia do site (docs/backup-e-vigia.md). */
  servidor: {
    ultimoBackup: { quando: string; bytes: number | null; localOk: boolean; externo: 'ok' | 'erro' | 'desligado'; mensagem: string | null } | null;
    ultimoBackupOk: string | null;
    ultimaCopiaExterna: string | null;
    ultimaVigia: { quando: string; ok: boolean; ms: number | null; mensagem: string | null; avisado: boolean } | null;
    vigiaFalhas24h: number;
    vigiaAvisoConfigurado: boolean;
  };
}

export interface UsuarioAdmin {
  id: string;
  nome: string;
  email: string;
  profissao?: string;
  criadoEm: string;
  confirmado: boolean;
  papel: Papel;
  bloqueado: boolean;
  saldo: Saldo;
  consultas: number;
  pago: number;
}

export interface ErroRegistrado {
  id: number;
  quando: string;
  origem: string;
  mensagem: string;
  detalhe?: string;
  rota?: string;
}

export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  valor: number;
  creditos: Saldo;
  destaque?: boolean;
  ativo: boolean;
}

export interface Plano {
  id: string;
  nome: string;
  descricao: string;
  valorMensal: number;
  /** Preço do plano anual (créditos do ano liberados no pagamento); null = sem opção anual. */
  valorAnual?: number | null;
  creditosMensais: Saldo;
  limiteCarteira: number;
  /** Pessoas que usam a conta, contando o responsável (1 = sem equipe). */
  limiteMembros?: number;
  destaque?: boolean;
  ativo: boolean;
}

export type PapelEquipe = 'responsavel' | 'administrador' | 'tecnico';

export interface MembroEquipe {
  usuarioId: string;
  nome: string;
  papel: PapelEquipe;
  /** Só para o responsável e os administradores. */
  email?: string;
  entrouEm?: string;
  consultasNoMes?: number;
}

export interface Equipe {
  papel: PapelEquipe;
  donoNome: string;
  limite: number;
  ocupacao: number;
  membros: MembroEquipe[];
  convites: { id: string; email: string; papel: Exclude<PapelEquipe, 'responsavel'>; criadoEm: string; expiraEm: string }[];
  podeGerir: boolean;
}

export interface ConviteEquipe {
  donoNome: string;
  papel: Exclude<PapelEquipe, 'responsavel'>;
  email: string;
  situacao: 'pendente' | 'aceito' | 'cancelado' | 'vencido';
}

export type CicloAssinatura = 'mensal' | 'anual';

export interface Assinatura {
  id: string;
  planoId: string;
  nomePlano: string;
  ciclo: CicloAssinatura;
  /** Valor de cada cobrança: a mensalidade ou, no anual, a anuidade. */
  valorMensal: number;
  creditos: Saldo;
  limiteCarteira: number;
  status: 'pendente' | 'ativa' | 'inadimplente' | 'cancelada';
  link?: string;
  criadaEm: string;
  ativadaEm?: string;
  /** Anual: até quando o ano pago vale; renovacaoCanceladaEm = não vai renovar. */
  validaAte?: string;
  renovacaoCanceladaEm?: string;
  /** Cupom em andamento: valorMensal é o valor com desconto; mesesRestantes null = todas as mensalidades. */
  desconto?: { cupom: string; valorCheio: number; mesesRestantes: number | null } | null;
}

export interface Catalogo {
  produtos: Produto[];
  pagamentoDisponivel: boolean;
  exigeDocumento: boolean;
  simulado: boolean;
}

export interface ImovelCarteira {
  id: string;
  codCar: string;
  apelido?: string;
  verificadoEm: string;
  criadoEm: string;
  resultado: ResultadoConsulta;
  ultimaConsultaId?: string;
  avisosNaoLidos: number;
}

export interface Aviso {
  id: string;
  imovelId: string;
  codCar: string;
  apelido?: string;
  consultaId?: string;
  alteracoes: { regraId: string; titulo: string; de: Status; para: Status; resumo: string; piorou: boolean }[];
  criadoEm: string;
  lido: boolean;
}

export interface Pedido {
  id: string;
  produto: string;
  valor: number;
  status: 'pendente' | 'pago' | 'estornado' | 'cancelado';
  criadoEm: string;
  cupom?: string;
  desconto?: number;
}

/** Preço de um plano ou produto com o cupom digitado (docs/cupons.md). */
/** Nos planos, ciclo diz se é o preço mensal ou o anual (os dois vêm na lista). */
export type PrecoCupom =
  | { id: string; plano: boolean; ciclo?: CicloAssinatura; valido: true; de: number; por: number; desconto: number; meses: number | null; texto: string }
  | { id: string; plano: boolean; ciclo?: CicloAssinatura; valido: false; mensagem: string };

export type SituacaoCupom = 'ativo' | 'pausado' | 'agendado' | 'vencido' | 'esgotado';

/** O que o administrador define em um cupom. */
export interface DadosCupom {
  codigo: string;
  descricao: string;
  tipo: 'percentual' | 'fixo';
  valor: number;
  /** Ids de planos e produtos; vazio = todos. */
  alvos: string[];
  /** Mensalidades com desconto; null = todas. */
  meses: number | null;
  limiteUsos: number | null;
  limitePorConta: number;
  apenasNovos: boolean;
  validoDe: string | null;
  validoAte: string | null;
  ativo: boolean;
}

export interface CupomAdmin extends DadosCupom {
  id: string;
  criadoEm: string;
  atualizadoEm: string;
  situacao: SituacaoCupom;
  usados: number;
  reservados: number;
  descontoConcedido: number;
  receita: number;
}

export interface UsoCupom {
  id: string;
  usuarioId: string;
  email: string;
  nome: string;
  pedidoId?: string;
  assinaturaId?: string;
  item: string;
  nomeItem: string;
  valorOriginal: number;
  valorFinal: number;
  meses: number | null;
  mensalidadesPagas: number;
  descontoEncerradoEm?: string;
  status: 'reservado' | 'usado' | 'liberado';
  criadoEm: string;
  usadoEm?: string;
}

export interface ItemCupom {
  id: string;
  nome: string;
  valor: number;
  plano: boolean;
  ativo: boolean;
}

export interface NovaConsulta {
  car: string;
  situacaoCar?: SituacaoCar;
  modulosFiscais?: number;
  usoColetivo?: boolean;
  geometria?: GeometriaImovel;
  documento?: string;
  consentimentoDocumento?: boolean;
}

export interface Saude {
  ok: boolean;
  banco: boolean;
  demo: Record<string, string> | null;
  /** Aviso no topo do site, definido pelo painel. */
  aviso: { texto: string; tipo: 'info' | 'alerta' } | null;
  /** ID do cliente do Google; null = sem o botão "Continuar com o Google". */
  google?: string | null;
}

export interface Configs {
  produtos: Produto[];
  planos: Plano[];
  limite_carteira: number;
  creditos_boas_vindas: Saldo;
  aviso_site: { ativo: boolean; texto: string; tipo: 'info' | 'alerta' };
  ia: ConfigIA;
  google: { clienteId: string };
}

export interface FuncoesIA {
  explicacao: boolean;
  recibo: boolean;
  documentos: boolean;
  rascunhos: boolean;
  carteira: boolean;
  normas: boolean;
}

export interface ConfigIA {
  ativo: boolean;
  modelo: string;
  limiteDiario: number;
  funcoes: FuncoesIA;
}

export type TarefaIA = 'explicacao' | 'recibo' | 'documento' | 'rascunho' | 'carteira' | 'norma' | 'teste';

/** O que a leitura do recibo do CAR achou (o técnico confere antes de consultar). */
export interface LeituraRecibo {
  car?: string;
  situacao?: SituacaoCar;
  areaHa?: number;
  modulosFiscais?: number;
  municipio?: string;
  uf?: string;
  dataInscricao?: string;
  origem: 'texto' | 'ia';
  avisoSemIA?: string;
}

export interface DocumentoConferido {
  id: string;
  regraId: string;
  nomeArquivo: string;
  tipoDocumento: string;
  orgao: string | null;
  numero: string | null;
  dataEmissao: string | null;
  validade: string | null;
  areaHa: number | null;
  requisito: string | null;
  car: 'este' | 'outro' | 'nao_encontrado';
  pontos: { texto: string; situacao: 'confere' | 'diverge' | 'conferir' }[];
  lidoDe: 'texto' | 'imagem';
  geradoEm: string;
}

export type TipoRascunho = 'carta_banco' | 'retificacao_car' | 'requerimento_orgao';

export interface Rascunho {
  id: string;
  regraId: string;
  tipo: TipoRascunho;
  titulo: string;
  texto: string;
  origem: 'ia' | 'modelo';
  geradoEm: string;
}

export interface ApoioDossie {
  documentos: DocumentoConferido[];
  rascunhos: Rascunho[];
  rascunhosPorItem: Record<string, { tipo: TipoRascunho; nome: string }[]>;
  /** Por que a IA não está disponível (null = disponível). */
  ia: { documentos: string | null; rascunhos: string | null };
}

export interface AnaliseNorma {
  id: string;
  titulo: string;
  resumo: string;
  vigencia: string | null;
  semRelacao: boolean;
  mudancas: { oQueMudou: string; regras: string[]; oQueConferir: string }[];
  geradaEm: string;
}

/** Explicação em linguagem simples para o produtor (docs/ia.md). */
export interface Explicacao {
  texto: string;
  /** "ia": escrita pela IA e conferida; "modelo": montada direto das regras, sem IA. */
  origem: 'ia' | 'modelo';
  modelo?: string;
  geradaEm: string;
}

export interface PainelIA {
  configuracao: ConfigIA;
  chave: { definida: boolean; final?: string; atualizadaEm?: string };
  uso: {
    hoje: number;
    mes: {
      chamadas: number;
      ok: number;
      rejeitadas: number;
      erros: number;
      tokensEntrada: number;
      tokensSaida: number;
      custoEstimadoUsd: number | null;
      porTarefa: Partial<Record<TarefaIA, number>>;
    };
  };
}

export interface CatalogoRegras {
  regras: { id: string; titulo: string; pergunta: string; normas: Norma[]; fontes: FonteId[] }[];
  fontes: Record<FonteId, Fonte>;
  atualizacoes: Partial<Record<FonteId, string>>;
}

export class ErroApi extends Error {
  constructor(
    message: string,
    public campo?: string,
    public status?: number,
  ) {
    super(message);
  }
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      ...init,
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    });
  } catch {
    throw new ErroApi('Sem conexão. Confira o sinal de internet e tente de novo.');
  }
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new ErroApi(corpo?.erro?.mensagem ?? 'Algo deu errado. Tente de novo em instantes.', corpo?.erro?.campo, resposta.status);
  }
  return corpo as T;
}

const post = (corpo?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(corpo ?? {}) });

export const api = {
  saude: () => pedir<Saude>('/v1/saude'),
  regras: () => pedir<CatalogoRegras>('/v1/regras'),
  consultar: (dados: NovaConsulta) => pedir<ConsultaSalva>('/v1/consultas', post(dados)),
  consulta: (id: string) => pedir<ConsultaSalva>(`/v1/consultas/${encodeURIComponent(id)}`),
  /** Vazio (null) quando o município não está na tabela do Incra. */
  moduloFiscal: (car: string) =>
    pedir<{ municipio: string | null; moduloFiscalHa: number | null }>(`/v1/modulo-fiscal/${encodeURIComponent(car)}`),
  lerReciboCar: (texto: string) => pedir<LeituraRecibo>('/v1/ia/recibo-car', post({ texto })),
  apoio: (id: string) => pedir<ApoioDossie>(`/v1/consultas/${encodeURIComponent(id)}/apoio`),
  conferirDocumento: (id: string, dados: { regraId: string; nomeArquivo: string; texto?: string; imagens?: string[] }) =>
    pedir<DocumentoConferido>(`/v1/consultas/${encodeURIComponent(id)}/documentos`, post(dados)),
  gerarRascunho: (id: string, regraId: string, tipo: TipoRascunho) =>
    pedir<Rascunho & { motivoSemIA?: string }>(`/v1/consultas/${encodeURIComponent(id)}/rascunhos`, post({ regraId, tipo })),
  apagarApoio: (id: string, item: string) =>
    pedir<{ ok: boolean }>(`/v1/consultas/${encodeURIComponent(id)}/apoio/${encodeURIComponent(item)}`, { method: 'DELETE' }),
  liberarDossie: (id: string) => pedir<{ ok: boolean; saldo?: Saldo }>(`/v1/consultas/${encodeURIComponent(id)}/dossie`, post()),
  explicar: (id: string) =>
    pedir<{ explicacao: Explicacao; motivo?: 'desligada' | 'sem_chave' | 'limite_diario' | 'falha' | 'barrada' }>(
      `/v1/consultas/${encodeURIComponent(id)}/explicacao`,
      post(),
    ),

  eu: () => pedir<Sessao>('/v1/eu'),
  criarConta: (dados: { nome: string; email: string; whatsapp?: string; profissao?: string; senha: string; aceiteTermos: boolean }) =>
    pedir<Sessao>('/v1/conta', post(dados)),
  /** Com a verificação em duas etapas, a 1ª tentativa sem código volta erro com campo "codigo". */
  entrar: (email: string, senha: string, codigo?: string) => pedir<Sessao>('/v1/sessao', post({ email, senha, codigo })),
  /** Login pela conta Google (docs/login-google.md): o ID token e, conforme o caso, senha, código ou aceite. */
  entrarGoogle: (dados: { credencial: string; senha?: string; codigo?: string; aceiteTermos?: boolean }) =>
    pedir<Sessao>('/v1/sessao/google', post(dados)),
  sair: () => pedir<{ ok: boolean }>('/v1/sessao', { method: 'DELETE' }),
  confirmarEmail: (token: string) => pedir<{ ok: boolean; saldo: Saldo }>('/v1/conta/confirmar', post({ token })),
  reenviarConfirmacao: () => pedir<{ ok: boolean; jaConfirmado?: boolean }>('/v1/conta/confirmacao', post()),
  marcarTour: () => pedir<{ ok: boolean }>('/v1/conta/tour', post()),
  /** Endereço do arquivo com os dados da conta (o navegador baixa direto, com o cookie). */
  enderecoMeusDados: '/v1/conta/dados',
  excluirConta: (senha: string) => pedir<{ ok: boolean }>('/v1/conta/excluir', post({ senha, confirmo: true })),
  esqueciSenha: (email: string) => pedir<{ ok: boolean; mensagem: string }>('/v1/senha/esqueci', post({ email })),
  /** Com a verificação em duas etapas, não entra direto: volta { entrar: true } e a pessoa entra com o código. */
  redefinirSenha: (token: string, senha: string) => pedir<Sessao | { ok: true; entrar: true }>('/v1/senha/redefinir', post({ token, senha })),
  doisFatores: {
    ver: () => pedir<{ ativo: boolean; codigosRestantes: number }>('/v1/conta/dois-fatores'),
    iniciar: (senha: string) => pedir<{ segredo: string; endereco: string }>('/v1/conta/dois-fatores/iniciar', post({ senha })),
    ativar: (codigo: string) => pedir<{ ok: boolean; codigosRecuperacao: string[] }>('/v1/conta/dois-fatores/ativar', post({ codigo })),
    desativar: (senha: string, codigo: string) => pedir<{ ok: boolean }>('/v1/conta/dois-fatores/desativar', post({ senha, codigo })),
  },

  produtos: () => pedir<Catalogo>('/v1/produtos'),
  /** Cupom de 100%: sem cobrança, volta gratis e o saldo novo em vez do link. */
  comprar: (produto: string, documento?: string, cupom?: string) =>
    pedir<{ id: string; link?: string; gratis?: boolean; saldo?: Saldo }>('/v1/pedidos', post({ produto, documento, cupom })),
  validarCupom: (codigo: string) => pedir<{ codigo: string; itens: PrecoCupom[] }>('/v1/cupons/validar', post({ codigo })),
  pedidos: () => pedir<{ pedidos: Pedido[] }>('/v1/pedidos'),
  pedido: (id: string) => pedir<{ pedido: Pedido; produto?: Produto }>(`/v1/pedidos/${encodeURIComponent(id)}`),
  planos: () => pedir<{ planos: Plano[]; pagamentoDisponivel: boolean; exigeDocumento: boolean }>('/v1/planos'),
  assinatura: () => pedir<{ assinatura: Assinatura | null; limiteCarteira: number; podePagar: boolean }>('/v1/assinatura'),
  assinar: (plano: string, documento?: string, cupom?: string, ciclo: CicloAssinatura = 'mensal') =>
    pedir<{ id: string; link: string }>('/v1/assinaturas', post({ plano, documento, cupom, ciclo })),
  cancelarAssinatura: () => pedir<{ ok: boolean; validaAte?: string }>('/v1/assinatura/cancelar', post()),
  pagarMesSimulado: (id: string) => pedir<{ ok: boolean; saldo: Saldo }>(`/v1/dev/assinaturas/${encodeURIComponent(id)}/pagar-mes`, post()),

  carteira: () => pedir<{ imoveis: ImovelCarteira[]; limite: number; disponivel: boolean; podeRemover: boolean }>('/v1/carteira'),
  acompanhar: (consultaId: string, apelido?: string) => pedir<ImovelCarteira>('/v1/carteira', post({ consultaId, apelido })),
  deixarDeAcompanhar: (id: string) => pedir<{ ok: boolean }>(`/v1/carteira/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  avisos: () => pedir<{ avisos: Aviso[]; naoLidos: number }>('/v1/avisos'),
  marcarAvisosLidos: () => pedir<{ ok: boolean }>('/v1/avisos/lidos', post()),

  equipe: {
    ver: () => pedir<Equipe>('/v1/equipe'),
    convidar: (email: string, papel: 'administrador' | 'tecnico') => pedir<{ ok: boolean }>('/v1/equipe/convites', post({ email, papel })),
    cancelarConvite: (id: string) => pedir<{ ok: boolean }>(`/v1/equipe/convites/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    mudarPapel: (usuarioId: string, papel: 'administrador' | 'tecnico') =>
      pedir<{ ok: boolean }>(`/v1/equipe/membros/${encodeURIComponent(usuarioId)}`, { method: 'PATCH', body: JSON.stringify({ papel }) }),
    /** Remove alguém, ou sai da equipe (com o próprio id). */
    remover: (usuarioId: string) => pedir<{ ok: boolean }>(`/v1/equipe/membros/${encodeURIComponent(usuarioId)}`, { method: 'DELETE' }),
    verConvite: (token: string) => pedir<ConviteEquipe>('/v1/convites/ver', post({ token })),
    aceitarConvite: (token: string) => pedir<{ ok: boolean; saldo: Saldo; equipe: Sessao['equipe'] }>('/v1/convites/aceitar', post({ token })),
  },

  admin: {
    resumo: () => pedir<PainelResumo>('/v1/admin/resumo'),
    usuarios: (busca = '') => pedir<{ usuarios: UsuarioAdmin[] }>(`/v1/admin/usuarios?busca=${encodeURIComponent(busca)}`),
    pedidos: () =>
      pedir<{ pedidos: (Pedido & { email: string; usuarioId: string; provedor: string; pagoEm: string | null; motivoEstorno?: string })[] }>(
        '/v1/admin/pedidos',
      ),
    cupons: () => pedir<{ cupons: CupomAdmin[]; itens: ItemCupom[]; hoje: string }>('/v1/admin/cupons'),
    cupom: (id: string) => pedir<{ cupom: CupomAdmin; usos: UsoCupom[] }>(`/v1/admin/cupons/${encodeURIComponent(id)}`),
    criarCupom: (dados: DadosCupom) => pedir<{ cupom: CupomAdmin }>('/v1/admin/cupons', post(dados)),
    salvarCupom: (id: string, dados: DadosCupom) =>
      pedir<{ cupom: CupomAdmin }>(`/v1/admin/cupons/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(dados) }),
    apagarCupom: (id: string) => pedir<{ ok: boolean }>(`/v1/admin/cupons/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    encerrarDescontoCupom: (usoId: string) =>
      pedir<{ ok: boolean; mensagem: string }>(`/v1/admin/cupons/usos/${encodeURIComponent(usoId)}/encerrar-desconto`, post()),
    estornar: (id: string, motivo: string) => pedir<{ ok: boolean }>(`/v1/admin/pedidos/${encodeURIComponent(id)}/estornar`, post({ motivo })),
    cancelarPedido: (id: string) => pedir<{ ok: boolean }>(`/v1/admin/pedidos/${encodeURIComponent(id)}/cancelar`, post()),
    cancelarAssinatura: (id: string) => pedir<{ ok: boolean }>(`/v1/admin/assinaturas/${encodeURIComponent(id)}/cancelar`, post()),
    configuracoes: () => pedir<Configs>('/v1/admin/configuracoes'),
    salvarConfiguracao: <K extends keyof Configs>(chave: K, valor: Configs[K]) =>
      pedir<{ ok: boolean; valor: Configs[K] }>(`/v1/admin/configuracoes/${chave}`, { method: 'PUT', body: JSON.stringify({ valor }) }),
    erros: () => pedir<{ erros: ErroRegistrado[] }>('/v1/admin/erros'),
    ajustarCreditos: (usuarioId: string, tipo: 'consulta' | 'dossie', quantidade: number, motivo: string) =>
      pedir<{ ok: boolean; saldo: Saldo }>(`/v1/admin/usuarios/${encodeURIComponent(usuarioId)}/creditos`, post({ tipo, quantidade, motivo })),
    ficha: (id: string) => pedir<FichaUsuario>(`/v1/admin/usuarios/${encodeURIComponent(id)}`),
    auditoria: () => pedir<{ auditoria: RegistroAuditoria[] }>('/v1/admin/auditoria'),
    entrarComo: (id: string) => pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/entrar-como`, post()),
    voltar: () => pedir<{ ok: boolean; voltarPara: string }>('/v1/admin/voltar', post()),
    bloquear: (id: string, motivo: string) => pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/bloquear`, post({ motivo })),
    desbloquear: (id: string) => pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/desbloquear`, post()),
    definirPapel: (id: string, papel: Papel) => pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/papel`, post({ papel })),
    reenviarConfirmacao: (id: string) => pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/reenviar-confirmacao`, post()),
    desativarDoisFatores: (id: string, motivo: string) =>
      pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/desativar-dois-fatores`, post({ motivo })),
    ia: () => pedir<PainelIA>('/v1/admin/ia'),
    salvarChaveIA: (chave: string) =>
      pedir<{ chave: PainelIA['chave'] }>('/v1/admin/ia/chave', { method: 'PUT', body: JSON.stringify({ chave }) }),
    apagarChaveIA: () => pedir<{ chave: PainelIA['chave'] }>('/v1/admin/ia/chave', { method: 'DELETE' }),
    normas: () => pedir<{ analises: AnaliseNorma[] }>('/v1/admin/ia/normas'),
    analisarNorma: (titulo: string, texto: string) => pedir<{ analise: AnaliseNorma }>('/v1/admin/ia/normas', post({ titulo, texto })),
    testarIA: () => pedir<{ ok: boolean; mensagem: string; ms?: number }>('/v1/admin/ia/testar', post()),
  },

  pagarSimulado: (id: string) => pedir<{ ok: boolean; saldo: Saldo }>(`/v1/dev/pedidos/${encodeURIComponent(id)}/pagar`, post()),
};
