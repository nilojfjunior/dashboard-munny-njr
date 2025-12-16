import { CleanedSaleRecord, AggregatedData, DashboardMetrics, DetailedTableRow } from '../types';
import * as XLSX from 'xlsx';

// Helper to normalize keys slightly
const normalizeStr = (val: any): string => String(val || '').toLowerCase().trim();

const cleanNumber = (val: any): number => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    let clean = val.trim();
    // Remove non-numeric chars except , . -
    clean = clean.replace(/[^\d,.-]/g, ''); 
    
    // Heuristic for BRL vs US parsing
    // BRL: 1.000,00
    // US: 1,000.00
    
    const lastDotIndex = clean.lastIndexOf('.');
    const lastCommaIndex = clean.lastIndexOf(',');
    
    // Case 1: Both exist. 
    // If comma is after dot -> BRL (1.000,00) -> Remove dots, swap comma
    // If dot is after comma -> US (1,000.00) -> Remove commas
    if (lastDotIndex !== -1 && lastCommaIndex !== -1) {
        if (lastCommaIndex > lastDotIndex) {
            // BRL
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            // US
            clean = clean.replace(/,/g, '');
        }
    } 
    // Case 2: Only Comma
    // 100,00 -> BRL Decimal
    else if (lastCommaIndex !== -1) {
        clean = clean.replace(',', '.');
    }
    // Case 3: Only Dot
    // 1.000 -> Is it 1000 (BRL thousand) or 1.0 (US decimal)?
    // Assumption: In this specific context (Sales Dashboard pt-BR), 
    // if the structure is exactly 3 digits after dot, it's likely a thousand separator.
    else if (lastDotIndex !== -1) {
        const parts = clean.split('.');
        // If last part has 3 digits and we have at least one dot, assume thousands.
        if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            clean = clean.replace(/\./g, '');
        }
        // else assume decimal (e.g. 10.5, 10.99)
    }
    
    return parseFloat(clean) || 0;
  }
  return 0;
};

// Map Portuguese short months
const ptMonths: { [key: string]: number } = {
  'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
  'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
};

const formatDate = (val: any): string => {
  if (val === null || val === undefined || val === '') return '';
  
  // 1. Handle Excel Date Object
  if (val instanceof Date) {
    const year = val.getFullYear();
    // Safety check: Filter out Excel "Zero" dates (1899) and very old dates
    if (year < 2000) return ''; 
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 2. Handle Excel Serial Number
  if (typeof val === 'number') {
    // Basic check to avoid small numbers (0, 1, 2...) being treated as 1900 dates
    // 36526 is approx year 2000.
    if (val < 36526) return ''; 

    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return '';
    
    const year = date.getFullYear();
    if (year < 2000) return '';

    return date.toISOString().split('T')[0];
  }

  // 3. Handle Strings
  if (typeof val === 'string') {
      const v = val.trim();

      // Priority: DD/MM/YYYY (Standard Brazil)
      const brDateMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (brDateMatch) {
        const day = brDateMatch[1].padStart(2, '0');
        const month = brDateMatch[2].padStart(2, '0');
        let yearStr = brDateMatch[3];
        let year = parseInt(yearStr);
        if (year < 100) year += 2000;
        
        if (year < 2000) return '';
        return `${year}-${month}-${day}`;
      }

      // Fallback: Month-Year (Ago-25)
      const monthYearMatch = v.toLowerCase().match(/^([a-z]{3})[\s\-\/](\d{2,4})$/);
      if (monthYearMatch) {
        const mStr = monthYearMatch[1];
        const yStr = monthYearMatch[2];
        
        if (ptMonths.hasOwnProperty(mStr)) {
          let year = parseInt(yStr);
          if (year < 100) year += 2000; 
          
          if (year < 2000) return '';

          const month = ptMonths[mStr] + 1;
          return `${year}-${String(month).padStart(2, '0')}-01`;
        }
      }

      // Fallback: ISO format yyyy-mm-dd
      if (v.match(/^\d{4}-\d{2}-\d{2}$/)) {
         const y = parseInt(v.substring(0, 4));
         if (y < 2000) return '';
         return v;
      }
  }
  return '';
};

export const parseExcelFile = async (file: File): Promise<CleanedSaleRecord[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Use header: 1 to get array of arrays (Matrix)
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length === 0) {
          resolve([]);
          return;
        }

        // Detect Header Row
        let headerRowIndex = -1;
        const keywords = ['loja', 'filial', 'categoria', 'produto', 'cor', 'tamanho', 'valor', 'total', 'qtd', 'quant', 'código', 'codigo'];
        
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const rowStr = rows[i].map(c => normalizeStr(c)).join(' ');
            let matches = 0;
            keywords.forEach(k => { if (rowStr.includes(k)) matches++; });
            if (matches >= 2) { 
                headerRowIndex = i;
                break;
            }
        }

        // Map column indices
        const headers = headerRowIndex !== -1 ? rows[headerRowIndex].map(h => normalizeStr(h)) : [];
        
        // Helper to find specific keyword sets
        const findSpecificIdx = (kws: string[]) => headers.findIndex(h => kws.some(k => h.includes(k)));

        const idxLoja = findSpecificIdx(['loja', 'filial']);
        const idxCat = findSpecificIdx(['categoria']);
        const idxSub = findSpecificIdx(['sub', 'grupo']);
        
        // Product Logic
        // Col D is Description (Produto)
        let idxProd = findSpecificIdx(['produto', 'descricao', 'descrição']);
        if (idxProd === -1) idxProd = 3; // Fallback to Col D (Index 3) if strictly following structure

        // Col C is Code (Código)
        let idxCodigo = findSpecificIdx(['código', 'codigo', 'referência', 'referencia', 'ref']);
        if (idxCodigo === -1) idxCodigo = 2; // Fallback to Col C (Index 2)

        // Col E is Cor
        let idxCor = findSpecificIdx(['cor']);
        if (idxCor === -1) idxCor = 4; // Fallback to Col E (Index 4)

        // Col F is Tamanho
        let idxTam = findSpecificIdx(['tamanho', 'tam']);
        if (idxTam === -1) idxTam = 5; // Fallback to Col F (Index 5)
        
        // NEW COLUMNS: Modelo and Colecao
        let idxColecao = findSpecificIdx(['coleção', 'colecao']);
        let idxModelo = findSpecificIdx(['modelo']);

        // STOCK COLUMN (Estoque)
        let idxEstoque = findSpecificIdx(['estoque', 'saldo', 'disponivel', 'disponível', 'atual']);

        // Fallbacks for new columns if header search fails
        // User spec: Colecao = G (Index 6), Modelo = I (Index 8)
        if (idxColecao === -1) idxColecao = 6;
        if (idxModelo === -1) idxModelo = 8;
        
        // QUANTITY COLUMN LOGIC:
        let idxQtd = findSpecificIdx(['quant', 'qtde', 'qtd', 'peças', 'pecas']);
        if (idxQtd === -1) {
             const exactTotalIdx = headers.findIndex(h => h === 'total');
             if (exactTotalIdx !== -1) idxQtd = exactTotalIdx;
        }
        // 3. HARD FALLBACK: Column K (Index 10)
        if (idxQtd === -1) idxQtd = 10;
        
        // VALUE COLUMN LOGIC:
        let idxVal = findSpecificIdx(['líquido', 'liquido', 'venda líquida', 'total líquido']);
        if (idxVal === -1) idxVal = findSpecificIdx(['valor total', 'venda']);
        if (idxVal === -1) idxVal = findSpecificIdx(['valor']);
        // 4. HARD FALLBACK: Column O (Index 14)
        if (idxVal === -1) idxVal = 14; 
        
        // DATE COLUMN: Prioritize "Data" header, otherwise FORCE Index 0 (Column A)
        let idxData = findSpecificIdx(['data', 'emissao', 'venda', 'periodo', 'mês']);
        if (idxData === -1) idxData = 0; 

        const dataRows = headerRowIndex !== -1 ? rows.slice(headerRowIndex + 1) : rows;

        const cleanedData: CleanedSaleRecord[] = dataRows.map((row, index) => {
          const getVal = (idx: number) => (idx !== -1 && row[idx] !== undefined) ? row[idx] : null;

          const rawData = getVal(idxData);
          const rawQtd = getVal(idxQtd);
          const rawVal = getVal(idxVal);
          const rawEstoque = getVal(idxEstoque); 
          
          const quantidade = cleanNumber(rawQtd) || 0; 
          const valorTotal = cleanNumber(rawVal);
          const estoque = cleanNumber(rawEstoque) || 0;
          const formattedDate = formatDate(rawData);

          return {
            id: `row-${index}`,
            loja: idxLoja !== -1 ? String(getVal(idxLoja) || 'Outros').trim() : 'Outros',
            codigo: idxCodigo !== -1 ? String(getVal(idxCodigo) || '').trim() : '',
            categoria: idxCat !== -1 ? String(getVal(idxCat) || 'Outros').trim() : 'Outros',
            subCategoria: idxSub !== -1 ? String(getVal(idxSub) || 'Outros').trim() : 'Outros',
            produto: idxProd !== -1 ? String(getVal(idxProd) || 'Produto').trim() : 'Produto',
            cor: idxCor !== -1 ? String(getVal(idxCor) || 'N/A').trim() : 'N/A',
            tamanho: idxTam !== -1 ? String(getVal(idxTam) || 'U').trim() : 'U',
            modelo: idxModelo !== -1 ? String(getVal(idxModelo) || 'N/A').trim() : 'N/A',
            colecao: idxColecao !== -1 ? String(getVal(idxColecao) || 'N/A').trim() : 'N/A',
            quantidade: quantidade,
            valorTotal: valorTotal,
            estoque: estoque,
            data: formattedDate,
          };
        });

        // Strict Filter: Must have valid Date (Year >= 2000) AND (Value > 0 OR Qty > 0)
        const validData = cleanedData.filter(d => d.data !== '' && (d.valorTotal > 0 || d.quantidade > 0));
        validData.sort((a, b) => a.data.localeCompare(b.data));

        resolve(validData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

export const aggregateBy = (
  data: CleanedSaleRecord[], 
  groupKey: keyof CleanedSaleRecord, 
  valueKey: 'valorTotal' | 'quantidade' = 'valorTotal'
): AggregatedData[] => {
  const map = new Map<string, number>();
  const countMap = new Map<string, number>();
  const estoqueMap = new Map<string, number>();

  data.forEach(item => {
    const group = String(item[groupKey]);
    const currentVal = map.get(group) || 0;
    const currentCount = countMap.get(group) || 0;
    const currentEstoque = estoqueMap.get(group) || 0;
    
    const addValue = item[valueKey] as number;
    map.set(group, currentVal + addValue);
    countMap.set(group, currentCount + item.quantidade);
    estoqueMap.set(group, currentEstoque + item.estoque);
  });

  return Array.from(map.entries())
    .map(([name, value]) => ({ 
      name, 
      value,
      count: countMap.get(name),
      estoque: estoqueMap.get(name)
    }))
    .sort((a, b) => b.value - a.value); 
};

export const prepareDataTable = (data: CleanedSaleRecord[]): DetailedTableRow[] => {
  // Key: Code + Color + Size
  const map = new Map<string, DetailedTableRow>();

  data.forEach(item => {
    // Composite key to aggregate unique products
    const key = `${item.codigo}|${item.cor}|${item.tamanho}`;
    
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        codigo: item.codigo,
        produto: item.produto,
        cor: item.cor,
        tamanho: item.tamanho,
        qtdCortada: 0, // Placeholder for future data
        qtdVendida: 0,
        faturado: 0,
        percentualVendido: 0
      });
    }

    const entry = map.get(key)!;
    entry.qtdVendida += item.quantidade;
    entry.faturado += item.valorTotal;
  });

  return Array.from(map.values()).map(entry => {
    // Logic for Sell-Through based on Cut Qty (when available)
    // If Cut is 0, we can't really calculate % Cut/Sold correctly, but user wants column.
    // % = (Sold / Cut) * 100. If Cut is 0, it's Infinity or 0 depending on logic.
    const pct = entry.qtdCortada > 0 ? (entry.qtdVendida / entry.qtdCortada) * 100 : 0;
    return { ...entry, percentualVendido: pct };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo));
};

export const sortSizes = (data: AggregatedData[]): AggregatedData[] => {
  const sizeOrder = [
    'RN', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'XXG', 'U', 'UN', 'ÚNICO',
    '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54'
  ];

  return [...data].sort((a, b) => {
    const nameA = a.name.toUpperCase();
    const nameB = b.name.toUpperCase();
    
    const indexA = sizeOrder.indexOf(nameA);
    const indexB = sizeOrder.indexOf(nameB);

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    const numA = parseInt(nameA);
    const numB = parseInt(nameB);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;

    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
};

export const calculateMetrics = (data: CleanedSaleRecord[]): DashboardMetrics => {
  const totalRevenue = data.reduce((acc, curr) => acc + curr.valorTotal, 0);
  const totalItems = data.reduce((acc, curr) => acc + curr.quantidade, 0);
  const totalStock = data.reduce((acc, curr) => acc + curr.estoque, 0);
  
  // Sell-Through Rate = Sold / (Sold + Stock)
  // Assumption: Manufactured = Sold + Remaining Stock
  const totalManufactured = totalItems + totalStock;
  const sellThroughRate = totalManufactured > 0 ? (totalItems / totalManufactured) * 100 : 0;

  const map = new Map<string, number>();
  data.forEach(item => {
      const current = map.get(item.loja) || 0;
      map.set(item.loja, current + item.valorTotal);
  });
  let topStore = 'N/A';
  let maxRev = 0;
  map.forEach((val, key) => {
      if(val > maxRev) {
          maxRev = val;
          topStore = key;
      }
  });

  return {
    totalRevenue,
    totalItems,
    averageTicket: data.length > 0 ? totalRevenue / data.length : 0,
    topStore,
    totalStock,
    sellThroughRate
  };
};

export const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL', 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(val);
};

export const formatNumber = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val);
};