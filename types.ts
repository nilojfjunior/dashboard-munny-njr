export interface RawSaleRecord {
  [key: string]: any;
}

export interface CleanedSaleRecord {
  id: string;
  loja: string;
  codigo: string; // Coluna C
  categoria: string;
  subCategoria: string;
  produto: string; // Coluna D (Descrição)
  cor: string; // Coluna E
  tamanho: string; // Coluna F
  quantidade: number; // Coluna K
  valorTotal: number; // Coluna O
  data: string;
  modelo: string;
  colecao: string;
  estoque: number;
}

export interface CorteRecord {
  codigo: string;
  cor: string;
  tamanho: string;
  quantidade: number;
}

export interface AggregatedData {
  name: string;
  value: number;
  count?: number;
  estoque?: number;
  [key: string]: any;
}

export interface DashboardMetrics {
  totalRevenue: number;
  totalItems: number;
  averageTicket: number;
  topStore: string;
  totalStock: number;
  totalCut: number; // Novo campo
  sellThroughRate: number;
}

export interface DetailedTableRow {
  id: string;
  codigo: string;
  produto: string;
  cor: string;
  tamanho: string;
  qtdCortada: number; // Virá da nova tabela
  qtdVendida: number; // Soma das vendas
  faturado: number; // Soma do valorTotal
  percentualVendido: number; // (Vendida / Cortada) * 100
}