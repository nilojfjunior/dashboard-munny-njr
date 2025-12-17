import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle, Plus } from 'lucide-react';
import { parseExcelFile, parseCorteFile } from '../services/dataProcessing';
import { CleanedSaleRecord, CorteRecord } from '../types';

interface DataUploaderProps {
  onDataLoaded: (data: CleanedSaleRecord[], corteData: CorteRecord[]) => void;
}

const DataUploader: React.FC<DataUploaderProps> = ({ onDataLoaded }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [cutsFile, setCutsFile] = useState<File | null>(null);

  const [loadedStats, setLoadedStats] = useState<{ sales: number; cuts: number } | null>(null);

  const handleProcess = async () => {
    if (!salesFile) {
        setError("Por favor, carregue pelo menos o arquivo de Vendas.");
        return;
    }

    setIsLoading(true);
    setError(null);
    setLoadedStats(null);

    try {
      // Process Sales
      const salesData = await parseExcelFile(salesFile);
      
      let cutsData: CorteRecord[] = [];
      if (cutsFile) {
          cutsData = await parseCorteFile(cutsFile);
      }

      if (salesData.length === 0) {
        setError("O arquivo de Vendas parece estar vazio ou não pôde ser lido.");
      } else {
        setLoadedStats({ sales: salesData.length, cuts: cutsData.length });
        
        // Small delay to let user see the success state before transition
        setTimeout(() => {
            onDataLoaded(salesData, cutsData);
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao processar os arquivos. Verifique se são Excel (.xlsx) válidos e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const FileInput = ({ 
    label, 
    file, 
    setFile, 
    required = false 
  }: { 
    label: string, 
    file: File | null, 
    setFile: (f: File | null) => void,
    required?: boolean
  }) => (
    <div className="flex-1 w-full">
        <p className="text-sm font-semibold text-gray-700 mb-2 flex justify-between">
            {label}
            {required && <span className="text-[#adb85c] text-xs">*Obrigatório</span>}
        </p>
        <div className="relative group">
          <label 
            className={`
              flex flex-col items-center justify-center w-full h-32 
              border-2 border-dashed rounded-lg cursor-pointer 
              transition-all duration-300
              ${file 
                ? 'border-green-300 bg-green-50' 
                : 'border-[#adb85c]/30 bg-[#f4f6e6] hover:bg-[#eef2d6]'}
            `}
          >
            <div className="flex flex-col items-center pt-5 pb-6">
              {file ? (
                  <>
                    <CheckCircle className="w-8 h-8 mb-3 text-green-600" />
                    <p className="mb-2 text-sm text-gray-600 font-medium px-2 text-center break-all">
                        {file.name}
                    </p>
                    <p className="text-xs text-green-600">Pronto para carregar</p>
                  </>
              ) : (
                  <>
                    <Upload className="w-8 h-8 mb-3 text-[#adb85c]" />
                    <p className="mb-2 text-sm text-gray-600">
                      <span className="font-semibold">Clique para selecionar</span>
                    </p>
                    <p className="text-xs text-gray-400">XLSX, XLS</p>
                  </>
              )}
            </div>
            <input 
              type="file" 
              accept=".xlsx, .xls"
              className="hidden" 
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={isLoading}
            />
          </label>
        </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="bg-white p-10 rounded-2xl shadow-xl border border-gray-100 max-w-2xl w-full">
        <div className="mb-6 flex justify-center">
          <div className="bg-[#f4f6e6] p-4 rounded-full">
            <FileSpreadsheet className="w-12 h-12 text-[#adb85c]" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Importar Arquivos</h2>
        <p className="text-gray-500 mb-8">
          Carregue os arquivos para gerar o relatório consolidado.
        </p>

        <div className="flex flex-col md:flex-row gap-6 mb-8">
            <FileInput label="1. Arquivo de Vendas (Geral)" file={salesFile} setFile={setSalesFile} required />
            <div className="hidden md:flex items-center justify-center pt-6">
                <Plus className="text-gray-300" />
            </div>
            <FileInput label="2. Arquivo de Corte (Opcional)" file={cutsFile} setFile={setCutsFile} />
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loadedStats && (
           <div className="mb-6 flex flex-col items-center justify-center gap-1 text-green-600 text-sm bg-green-50 p-3 rounded-lg">
             <div className="flex items-center gap-2 font-bold">
                <CheckCircle className="w-4 h-4" />
                <span>Dados processados com sucesso!</span>
             </div>
             <div className="text-xs text-gray-600">
                Vendas: {loadedStats.sales} registros | Corte: {loadedStats.cuts} registros
             </div>
           </div>
        )}

        <button
            onClick={handleProcess}
            disabled={isLoading || !salesFile || loadedStats !== null}
            className={`
                w-full py-3 rounded-lg font-bold text-white shadow-md transition-all
                flex items-center justify-center gap-2
                ${isLoading || !salesFile ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#adb85c] hover:bg-[#9ca653] hover:shadow-lg'}
            `}
        >
            {isLoading ? (
                <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processando...
                </>
            ) : loadedStats ? (
                "Carregando Dashboard..."
            ) : (
                "Gerar Dashboard"
            )}
        </button>

      </div>
    </div>
  );
};

export default DataUploader;