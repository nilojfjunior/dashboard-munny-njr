import { CleanedSaleRecord, AggregatedData, DashboardMetrics, DetailedTableRow, CorteRecord } from '../types';
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
    const lastDotIndex = clean.lastIndexOf('.');
    const lastCommaIndex = clean.lastIndexOf(',');
    
    if (lastDotIndex !== -1 && lastCommaIndex !== -1) {
        if (lastCommaIndex > lastDotIndex) {
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            clean = clean.replace(/,/g, '');
        }
    } 
    else if (lastCommaIndex !== -1) {
        clean = clean.replace(',', '.');
    }
    else if (lastDotIndex !== -1) {
        const parts = clean.split('.');
        if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            clean = clean.replace(/\./g, '');
        }
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
    if (year < 2000) return ''; 
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 2. Handle Excel Serial Number
  if (typeof val === 'number') {
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
        
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length === 0) {
          resolve([]);
          return;
        }

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

        const headers = headerRowIndex !== -1 ? rows[headerRowIndex].map(h => normalizeStr(h)) : [];
        const findSpecificIdx = (kws: string[]) => headers.findIndex(h => kws.some(k => h.includes(k)));

        const idxLoja = findSpecificIdx(['loja', 'filial']);
        const idxCat = findSpecificIdx(['categoria']);
        const idxSub = findSpecificIdx(['sub', 'grupo']);
        let idxProd = findSpecificIdx(['produto', 'descricao', 'descrição']);
        if (idxProd === -1) idxProd = 3; 

        let idxCodigo = findSpecificIdx(['código', 'codigo', 'referência', 'referencia', 'ref']);
        if (idxCodigo === -1) idxCodigo = 2; 

        let idxCor = findSpecificIdx(['cor']);
        if (idxCor === -1) idxCor = 4;

        let idxTam = findSpecificIdx(['tamanho', 'tam']);
        if (idxTam === -1) idxTam = 5; 
        
        let idxColecao = findSpecificIdx(['coleção', 'colecao']);
        let idxModelo = findSpecificIdx(['modelo']);
        let idxEstoque = findSpecificIdx(['estoque', 'saldo', 'disponivel', 'disponível', 'atual']);

        if (idxColecao === -1) idxColecao = 6;
        if (idxModelo === -1) idxModelo = 8;
        
        let idxQtd = findSpecificIdx(['quant', 'qtde', 'qtd', 'peças', 'pecas']);
        if (idxQtd === -1) {
             const exactTotalIdx = headers.findIndex(h => h === 'total');
             if (exactTotalIdx !== -1) idxQtd = exactTotalIdx;
        }
        if (idxQtd === -1) idxQtd = 10;
        
        let idxVal = findSpecificIdx(['líquido', 'liquido', 'venda líquida', 'total líquido']);
        if (idxVal === -1) idxVal = findSpecificIdx(['valor total', 'venda']);
        if (idxVal === -1) idxVal = findSpecificIdx(['valor']);
        if (idxVal === -1) idxVal = 14; 
        
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

export const parseCorteFile = async (file: File): Promise<CorteRecord[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length === 0) {
          resolve([]);
          return;
        }

        let headerRowIndex = -1;
        const keywords = ['produto', 'referência', 'codigo', 'cor', 'tamanho', 'qtd', 'cortada'];
        
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const rowStr = rows[i].map(c => normalizeStr(c)).join(' ');
            let matches = 0;
            keywords.forEach(k => { if (rowStr.includes(k)) matches++; });
            if (matches >= 2) { 
                headerRowIndex = i;
                break;
            }
        }

        const headers = headerRowIndex !== -1 ? rows[headerRowIndex].map(h => normalizeStr(h)) : [];
        const findSpecificIdx = (kws: string[]) => headers.findIndex(h => kws.some(k => h.includes(k)));

        // CRITICAL FIX: Do NOT include 'produto' in the search for code/ref, 
        // as it often matches the description column instead.
        let idxCodigo = findSpecificIdx(['código', 'codigo', 'referência', 'referencia', 'ref']);
        
        let idxCor = findSpecificIdx(['cor']);
        let idxTam = findSpecificIdx(['tamanho', 'tam']);
        let idxQtd = findSpecificIdx(['qtd', 'quantidade', 'total', 'cortado', 'corte']);

        // Fallbacks based on common positions if headers not found or ambiguous
        if (idxCodigo === -1) idxCodigo = 0; // Assume Col A is Code/Ref
        if (idxCor === -1) idxCor = 2; // Assume Col C is Color (A=Ref, B=Desc)
        if (idxTam === -1) idxTam = 3; // Assume Col D is Size
        if (idxQtd === -1) idxQtd = 4; // Assume Col E is Qty

        const dataRows = headerRowIndex !== -1 ? rows.slice(headerRowIndex + 1) : rows;

        const cleanedData: CorteRecord[] = dataRows.map((row) => {
          const getVal = (idx: number) => (idx !== -1 && row[idx] !== undefined) ? row[idx] : null;

          return {
            codigo: idxCodigo !== -1 ? String(getVal(idxCodigo) || '').trim() : '',
            cor: idxCor !== -1 ? String(getVal(idxCor) || 'N/A').trim() : 'N/A',
            tamanho: idxTam !== -1 ? String(getVal(idxTam) || 'U').trim() : 'U',
            quantidade: cleanNumber(getVal(idxQtd)) || 0
          };
        }).filter(r => r.codigo !== '' && r.quantidade > 0);

        resolve(cleanedData);

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

export const prepareDataTable = (data: CleanedSaleRecord[], corteData: CorteRecord[] = []): DetailedTableRow[] => {
  // Key: Code + Color + Size (Normalized)
  const map = new Map<string, DetailedTableRow>();
  const genKey = (code: string, color: string, size: string) => 
    `${normalizeStr(code)}|${normalizeStr(color)}|${normalizeStr(size)}`;

  // 1. Process Sales Data
  data.forEach(item => {
    const key = genKey(item.codigo, item.cor, item.tamanho);
    
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        codigo: item.codigo,
        produto: item.produto,
        cor: item.cor,
        tamanho: item.tamanho,
        qtdCortada: 0, 
        qtdVendida: 0,
        faturado: 0,
        percentualVendido: 0
      });
    }

    const entry = map.get(key)!;
    entry.qtdVendida += item.quantidade;
    entry.faturado += item.valorTotal;
  });

  // 2. Process Corte Data (Merge)
  corteData.forEach(item => {
    const key = genKey(item.codigo, item.cor, item.tamanho);
    
    if (map.has(key)) {
      const entry = map.get(key)!;
      entry.qtdCortada += item.quantidade;
    } else {
      // Add items that were cut but not sold
      map.set(key, {
        id: key,
        codigo: item.codigo,
        produto: 'Sem Venda', // Fallback
        cor: item.cor,
        tamanho: item.tamanho,
        qtdCortada: item.quantidade,
        qtdVendida: 0,
        faturado: 0,
        percentualVendido: 0
      });
    }
  });

  return Array.from(map.values()).map(entry => {
    // Logic for Sell-Through based on Cut Qty
    // If QtdCortada is 0, we can't calculate a valid percentage based on production, 
    // but we can default to 100% or N/A logic in display.
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

export const calculateMetrics = (data: CleanedSaleRecord[], corteData: CorteRecord[] = []): DashboardMetrics => {
  const totalRevenue = data.reduce((acc, curr) => acc + curr.valorTotal, 0);
  const totalItems = data.reduce((acc, curr) => acc + curr.quantidade, 0);
  const totalStock = data.reduce((acc, curr) => acc + curr.estoque, 0);
  const totalCut = corteData.reduce((acc, curr) => acc + curr.quantidade, 0);
  
  // Sell-Through Rate = Sold / (Sold + Stock) 
  // OR based on Cut if available. But typically standard Sell-Through is based on stock on hand + sold.
  // If we have totalCut, we could do (Sold / Cut), but stick to standard definition or use Cut if provided?
  // Let's stick to the previous definition for the main KPI, but add Cut as a separate metric.
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
    totalCut,
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