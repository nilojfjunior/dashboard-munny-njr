import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LabelList
} from 'recharts';
import { CleanedSaleRecord, DetailedTableRow, CorteRecord } from '../types';
import { aggregateBy, calculateMetrics, formatCurrency, formatNumber, sortSizes, prepareDataTable } from '../services/dataProcessing';
import { Store, ShoppingBag, TrendingUp, Tag, Filter, XCircle, Calendar, DollarSign, Box, Percent, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Scissors, AlertTriangle } from 'lucide-react';

interface DashboardProps {
  data: CleanedSaleRecord[];
  corteData: CorteRecord[];
  onReset: () => void;
}

// Munny Brand Colors
const BRAND_PRIMARY = '#adb85c';
const BRAND_SECONDARY = '#e5eaf3';
const BRAND_DARK = '#8d9648'; 

const COLORS = [BRAND_PRIMARY, '#d4db9b', '#7e8543', '#f0f2da', '#606633', '#cdd66f', '#e2e6b8', '#9ca653'];

type SortKey = keyof DetailedTableRow;
type SortDirection = 'asc' | 'desc';

const Dashboard: React.FC<DashboardProps> = ({ data, corteData, onReset }) => {
  // Filter States
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedColecao, setSelectedColecao] = useState<string>('all');
  
  // Date range
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  
  // Table Search State
  const [searchCode, setSearchCode] = useState('');

  // Table Sort State
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'faturado', direction: 'desc' });

  // Metric Toggle
  const [metricMode, setMetricMode] = useState<'revenue' | 'quantity'>('revenue');

  // Pagination State
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // 1. Calculate Data Constraints (Dates)
  const { minAllowedDate, maxAllowedDate } = useMemo(() => {
    if (data.length === 0) return { minAllowedDate: '', maxAllowedDate: '' };
    const sortedDates = [...data].map(d => d.data).sort();
    return {
      minAllowedDate: sortedDates[0] ? sortedDates[0].substring(0, 7) : '',
      maxAllowedDate: sortedDates[sortedDates.length - 1] ? sortedDates[sortedDates.length - 1].substring(0, 7) : ''
    };
  }, [data]);

  useEffect(() => {
    if (minAllowedDate && maxAllowedDate && !dateRange.start) {
      setDateRange({ start: minAllowedDate, end: maxAllowedDate });
    }
  }, [minAllowedDate, maxAllowedDate]);

  const storeOptions = useMemo(() => Array.from(new Set(data.map(d => d.loja))).sort(), [data]);
  const categoryOptions = useMemo(() => Array.from(new Set(data.map(d => d.categoria))).sort(), [data]);
  const colecaoOptions = useMemo(() => Array.from(new Set(data.map(d => d.colecao))).sort(), [data]);

  // 2. Build Metadata Map (Code -> Category/Collection) to enable filtering on CorteData
  // Since CorteData usually lacks Category/Collection info, we borrow it from Sales History.
  const productMetaMap = useMemo(() => {
    const map = new Map<string, { cat: string, col: string }>();
    data.forEach(item => {
      // We normalize the code to ensure matching
      const key = String(item.codigo).trim();
      if (!map.has(key)) {
        map.set(key, { cat: item.categoria, col: item.colecao });
      }
    });
    return map;
  }, [data]);

  // 3. Filter SALES Data
  const filteredSalesData = useMemo(() => {
    const term = searchCode.toLowerCase().trim();

    return data.filter(item => {
      const storeMatch = selectedStore === 'all' || item.loja === selectedStore;
      const catMatch = selectedCategory === 'all' || item.categoria === selectedCategory;
      const colMatch = selectedColecao === 'all' || item.colecao === selectedColecao;
      
      let dateMatch = true;
      if (dateRange.start && item.data < `${dateRange.start}-01`) dateMatch = false;
      if (dateRange.end && item.data > `${dateRange.end}-31`) dateMatch = false;

      let codeMatch = true;
      if (term) {
        codeMatch = String(item.codigo).toLowerCase().includes(term);
      }

      return storeMatch && catMatch && colMatch && dateMatch && codeMatch;
    });
  }, [data, selectedStore, selectedCategory, selectedColecao, dateRange, searchCode]);

  // 4. Filter CORTE Data (Apply same filters: Category, Collection, Code Search)
  const filteredCorteData = useMemo(() => {
    const term = searchCode.toLowerCase().trim();

    // If no structural filters are applied, return all (unless searching code)
    if (selectedCategory === 'all' && selectedColecao === 'all' && !term) {
      return corteData;
    }

    return corteData.filter(item => {
      const key = String(item.codigo).trim();
      const meta = productMetaMap.get(key);
      
      const itemCat = meta?.cat || 'Outros';
      const itemCol = meta?.col || 'N/A';

      const catMatch = selectedCategory === 'all' || itemCat === selectedCategory;
      const colMatch = selectedColecao === 'all' || itemCol === selectedColecao;
      
      let codeMatch = true;
      if (term) {
        codeMatch = key.toLowerCase().includes(term);
      }

      return catMatch && colMatch && codeMatch;
    });
  }, [corteData, productMetaMap, selectedCategory, selectedColecao, searchCode]);


  const valueKey = metricMode === 'revenue' ? 'valorTotal' : 'quantidade';

  // Aggregations & Metrics (Using Filtered Lists for both Sales and Cuts)
  const metrics = useMemo(() => calculateMetrics(filteredSalesData, filteredCorteData), [filteredSalesData, filteredCorteData]);
  
  const byStore = useMemo(() => aggregateBy(filteredSalesData, 'loja', valueKey), [filteredSalesData, valueKey]);
  const byCategory = useMemo(() => aggregateBy(filteredSalesData, 'categoria', valueKey), [filteredSalesData, valueKey]);
  const bySubCategory = useMemo(() => aggregateBy(filteredSalesData, 'subCategoria', valueKey), [filteredSalesData, valueKey]);
  const byColor = useMemo(() => aggregateBy(filteredSalesData, 'cor', valueKey), [filteredSalesData, valueKey]);
  const byColecao = useMemo(() => aggregateBy(filteredSalesData, 'colecao', valueKey), [filteredSalesData, valueKey]);
  const byModelo = useMemo(() => aggregateBy(filteredSalesData, 'modelo', valueKey), [filteredSalesData, valueKey]);
  
  const bySize = useMemo(() => {
    const rawSizes = aggregateBy(filteredSalesData, 'tamanho', valueKey);
    return sortSizes(rawSizes);
  }, [filteredSalesData, valueKey]);

  // Table Data Processing
  const tableData: DetailedTableRow[] = useMemo(() => {
    // Pass both FILTERED lists to the table generator
    const prepared = prepareDataTable(filteredSalesData, filteredCorteData);

    return prepared.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === bValue) return 0;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      const aString = String(aValue).toLowerCase();
      const bString = String(bValue).toLowerCase();

      if (sortConfig.direction === 'asc') {
        return aString.localeCompare(bString);
      } else {
        return bString.localeCompare(aString);
      }
    });
  }, [filteredSalesData, filteredCorteData, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(tableData.length / rowsPerPage);
  const paginatedTableData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return tableData.slice(start, start + rowsPerPage);
  }, [tableData, currentPage, rowsPerPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const formatValue = (val: number) => {
    return metricMode === 'revenue' ? formatCurrency(val) : formatNumber(val);
  };

  // ... (Keep existing chart render functions: CustomTooltip, renderCustomizedLabel, etc.) ...
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded text-sm z-50">
          <p className="font-bold mb-1">{label}</p>
          <p className="text-[#adb85c] font-semibold">{formatValue(payload[0].value)}</p>
          {metricMode === 'revenue' && payload[0].payload.count !== undefined && (
             <p className="text-gray-500 text-xs mt-1">Qtd: {payload[0].payload.count} itens</p>
          )}
        </div>
      );
    }
    return null;
  };

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value }: any) => {
    const radius = outerRadius * 1.15; 
    const x = cx + radius * Math.cos(-Math.PI / 180 * midAngle);
    const y = cy + radius * Math.sin(-Math.PI / 180 * midAngle);
    if (percent < 0.03) return null;
    return (
      <text x={x} y={y} fill="#374151" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
        {`${name}: ${formatValue(value)} (${(percent * 100).toFixed(0)}%)`}
      </text>
    );
  };

  const renderBarLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    if (width < 20 && height < 20) return null;
    return (
      <text x={x + width / 2} y={y - 5} fill="#666" textAnchor="middle" fontSize={10}>
        {formatValue(value)}
      </text>
    );
  };

  const renderVerticalBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (width < 5) return null;
    return (
      <text x={x + width / 2} y={y - 5} fill="#555" textAnchor="start" fontSize={11} fontWeight={500} transform={`rotate(-90 ${x + width / 2} ${y - 5})`}>
        {formatValue(value)}
      </text>
    );
  };

  const renderHorizontalBarLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    return (
      <text x={x + width + 5} y={y + height / 2} fill="#666" textAnchor="start" dominantBaseline="middle" fontSize={10}>
        {formatValue(value)}
      </text>
    );
  };

  const SortableHeader = ({ label, sortKey, align = 'left' }: { label: string, sortKey: SortKey, align?: 'left' | 'right' }) => (
    <th 
      className={`px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors group ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => handleSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        {label}
        <span className="text-gray-400 group-hover:text-[#adb85c]">
          {sortConfig.key === sortKey ? (
            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-50" />
          )}
        </span>
      </div>
    </th>
  );

  return (
    <div className="min-h-screen bg-[#e5eaf3] pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4 md:space-y-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-[#adb85c]" />
              <h1 className="text-xl font-bold text-[#adb85c] tracking-tight">MUNNY <span className="text-gray-500 font-normal">Analytics</span></h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Metric Toggle */}
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setMetricMode('revenue')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${metricMode === 'revenue' ? 'bg-white text-[#adb85c] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  R$
                </button>
                <button
                  onClick={() => setMetricMode('quantity')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${metricMode === 'quantity' ? 'bg-white text-[#adb85c] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Box className="w-3.5 h-3.5" />
                  Qtd
                </button>
              </div>

              <div className="h-6 w-px bg-gray-200 hidden md:block"></div>

              {/* Date & Filters */}
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                <Calendar className="w-4 h-4 text-gray-500" />
                <input 
                  type="month" 
                  value={dateRange.start} 
                  min={minAllowedDate}
                  max={maxAllowedDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent text-sm border-none focus:ring-0 text-gray-700 w-32 p-0 cursor-pointer"
                />
                <span className="text-gray-400">-</span>
                <input 
                  type="month" 
                  value={dateRange.end} 
                  min={minAllowedDate}
                  max={maxAllowedDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent text-sm border-none focus:ring-0 text-gray-700 w-32 p-0 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                <Filter className="w-4 h-4 text-gray-500" />
                <select 
                  value={selectedStore} 
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="bg-transparent text-sm border-none focus:ring-0 text-gray-700 font-medium cursor-pointer w-24 md:w-auto"
                >
                  <option value="all">Todas as Lojas</option>
                  {storeOptions.map(store => (
                    <option key={store} value={store}>{store}</option>
                  ))}
                </select>

                <div className="w-px h-4 bg-gray-300 mx-1"></div>

                <select 
                  value={selectedCategory} 
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-transparent text-sm border-none focus:ring-0 text-gray-700 font-medium cursor-pointer w-24 md:w-auto"
                >
                  <option value="all">Todas as Categorias</option>
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <div className="w-px h-4 bg-gray-300 mx-1"></div>

                <select 
                  value={selectedColecao} 
                  onChange={(e) => setSelectedColecao(e.target.value)}
                  className="bg-transparent text-sm border-none focus:ring-0 text-gray-700 font-medium cursor-pointer w-24 md:w-auto"
                >
                  <option value="all">Todas as Coleções</option>
                  {colecaoOptions.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>

                {(selectedStore !== 'all' || selectedCategory !== 'all' || selectedColecao !== 'all' || searchCode !== '') && (
                  <button 
                    onClick={() => { 
                      setSelectedStore('all'); 
                      setSelectedCategory('all'); 
                      setSelectedColecao('all');
                      setSearchCode(''); 
                    }}
                    className="ml-2 text-gray-400 hover:text-red-500"
                    title="Limpar Todos Filtros"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="h-6 w-px bg-gray-200 hidden md:block"></div>
              
              <button onClick={onReset} className="text-xs text-gray-500 hover:text-red-600 underline px-2">Sair</button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className={`p-6 rounded-xl shadow-sm border transition-all bg-white border-[#adb85c]/30 ring-1 ring-[#adb85c]/10`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Faturamento Total</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(metrics.totalRevenue)}</h3>
              </div>
              <div className="p-2 bg-[#f4f6e6] rounded-lg text-[#adb85c]">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-xl shadow-sm border transition-all bg-white border-[#adb85c]/30 ring-1 ring-[#adb85c]/10`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Peças Vendidas (Período)</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(metrics.totalItems)}</h3>
              </div>
              <div className="p-2 bg-[#f4f6e6] rounded-lg text-[#adb85c]">
                <Tag className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Peças Cortadas (Filtro)</p>
               <h3 className="text-2xl font-bold text-gray-900 mt-1">
                  {formatNumber(metrics.totalCut)}
               </h3>
               {metrics.totalCut > 0 ? (
                 <p className={`text-xs mt-1 font-medium ${
                     metrics.totalItems > metrics.totalCut ? 'text-purple-600' : 'text-gray-500'
                 }`}>
                    {((metrics.totalItems / metrics.totalCut) * 100).toFixed(1)}% de giro (venda/corte)
                 </p>
               ) : (
                 <p className="text-xs text-red-400 mt-1">Sem corte para este filtro</p>
               )}
            </div>
            <div className="p-2 bg-[#f4f6e6] rounded-lg text-[#adb85c]">
              <Scissors className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Giro (Venda / Estoque)</p>
              <div className="flex items-baseline gap-2 mt-1">
                 <h3 className="text-2xl font-bold text-gray-900">
                    {metrics.sellThroughRate.toFixed(1)}%
                 </h3>
                 <span className="text-xs text-gray-400 font-medium">de {formatNumber(metrics.totalItems + metrics.totalStock)} itens</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                <div className="bg-[#adb85c] h-1.5 rounded-full" style={{ width: `${Math.min(metrics.sellThroughRate, 100)}%` }}></div>
              </div>
            </div>
            <div className="p-2 bg-[#f4f6e6] rounded-lg text-[#adb85c]">
              <Percent className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6">{metricMode === 'revenue' ? 'Faturamento por Loja' : 'Vendas (Qtd) por Loja'}</h3>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byStore.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 60, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#eee" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={100} tick={{fontSize: 11}} interval={0} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill={metricMode === 'revenue' ? BRAND_PRIMARY : "#3b82f6"} radius={[0, 4, 4, 0]} barSize={25}>
                    {byStore.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                    <LabelList dataKey="value" content={renderHorizontalBarLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6">{metricMode === 'revenue' ? 'Faturamento por Categoria' : 'Vendas (Qtd) por Categoria'}</h3>
            <div className="h-[400px] w-full flex justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 20, right: 40, left: 40, bottom: 20 }}>
                  <Pie data={byCategory} cx="50%" cy="50%" innerRadius={60} outerRadius={100} fill={BRAND_PRIMARY} paddingAngle={2} dataKey="value" label={renderCustomizedLabel} labelLine={true}>
                    {byCategory.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Top Coleções</h3>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byColecao.slice(0, 10)} margin={{ top: 60, right: 10, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={70} tick={{fontSize: 10}} />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill="#ffc658" radius={[4, 4, 0, 0]}>
                     <LabelList dataKey="value" content={renderVerticalBarLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Top Modelos</h3>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byModelo.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 60, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#eee" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={80} tick={{fontSize: 10}} interval={0} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                    {byModelo.slice(0, 10).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    <LabelList dataKey="value" content={renderHorizontalBarLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Top Sub-Categorias</h3>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySubCategory.slice(0, 15)} margin={{ top: 20, right: 10, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={70} tick={{fontSize: 10}} />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill="#82ca9d" radius={[4, 4, 0, 0]}>
                     <LabelList dataKey="value" content={renderBarLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-8">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-500 uppercase mb-4">Por Tamanho</h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySize}>
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" fill="#FFBB28" radius={[2,2,0,0]}>
                      <LabelList dataKey="value" position="top" formatter={(val: number) => metricMode === 'revenue' ? formatNumber(val) : val} style={{fontSize: '9px', fill: '#666'}} />
                    </Bar>
                    <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
             <div className="flex-1 border-t pt-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase mb-4">Por Cor (Top 5)</h3>
               <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byColor.slice(0, 5)} layout="vertical" margin={{right: 40}}>
                    <Tooltip content={<CustomTooltip />} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={70} tick={{fontSize: 10}} />
                    <Bar dataKey="value" fill="#FF8042" radius={[0,4,4,0]}>
                      <LabelList dataKey="value" content={renderHorizontalBarLabel} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Data Table Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Detalhamento por Produto (Corte x Venda)</h3>
            
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
              {/* Search Code */}
              <div className="relative w-full md:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Digite parte do código..."
                  className="pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-gray-400 rounded-lg text-sm w-full focus:ring-2 focus:ring-[#adb85c] focus:border-transparent transition-all"
                  value={searchCode}
                  onChange={(e) => { setSearchCode(e.target.value); setCurrentPage(1); }}
                />
              </div>

              {/* Rows Per Page */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Linhas por página:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="border border-gray-300 rounded-lg text-sm py-1.5 px-3 focus:ring-[#adb85c] focus:border-[#adb85c] bg-white"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <SortableHeader label="Código" sortKey="codigo" />
                  <SortableHeader label="Descrição" sortKey="produto" />
                  <SortableHeader label="Cor" sortKey="cor" />
                  <SortableHeader label="Tamanho" sortKey="tamanho" />
                  <SortableHeader label="Qtd. Cortada" sortKey="qtdCortada" align="right" />
                  <SortableHeader label="Qtd. Vendida" sortKey="qtdVendida" align="right" />
                  <SortableHeader label="Faturado (R$)" sortKey="faturado" align="right" />
                  <SortableHeader label="% Giro (Venda/Corte)" sortKey="percentualVendido" align="right" />
                </tr>
              </thead>
              <tbody>
                {paginatedTableData.length > 0 ? (
                  paginatedTableData.map((row) => {
                    let badgeClass = '';
                    let badgeText = '';
                    
                    if (row.qtdCortada === 0) {
                        badgeClass = 'bg-gray-100 text-gray-400';
                        badgeText = '-';
                    } else {
                        // Clean Percentage logic
                        const pct = row.percentualVendido;
                        badgeText = `${pct.toFixed(1)}%`;
                        
                        if (pct > 100) {
                            // Purple for > 100% (Stock turnover/old stock consumption)
                            badgeClass = 'bg-purple-100 text-purple-700 font-bold';
                        } else if (pct >= 80) {
                            badgeClass = 'bg-[#d4db9b] text-[#606633] font-bold';
                        } else if (pct >= 50) {
                             badgeClass = 'bg-yellow-100 text-yellow-700';
                        } else {
                             badgeClass = 'bg-red-50 text-red-600';
                        }
                    }

                    return (
                        <tr key={row.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{row.codigo || '-'}</td>
                        <td className="px-6 py-4 max-w-[200px] truncate" title={row.produto}>{row.produto}</td>
                        <td className="px-6 py-4">{row.cor}</td>
                        <td className="px-6 py-4">{row.tamanho}</td>
                        <td className="px-6 py-4 text-right">{row.qtdCortada || '-'}</td>
                        <td className="px-6 py-4 text-right">{formatNumber(row.qtdVendida)}</td>
                        <td className="px-6 py-4 text-right text-[#adb85c] font-medium">{formatCurrency(row.faturado)}</td>
                        <td className="px-6 py-4 text-right">
                            <span className={`px-3 py-1 rounded-full text-xs text-center min-w-[3.5rem] inline-block ${badgeClass}`}>
                            {badgeText}
                            </span>
                        </td>
                        </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      Nenhum dado encontrado para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Mostrando {Math.min((currentPage - 1) * rowsPerPage + 1, tableData.length)} até {Math.min(currentPage * rowsPerPage, tableData.length)} de {tableData.length} registros
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5 && currentPage > 3) {
                     pageNum = currentPage - 3 + i;
                  }
                  if (pageNum > totalPages) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors ${
                        currentPage === pageNum 
                          ? 'bg-[#adb85c] text-white' 
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default Dashboard;