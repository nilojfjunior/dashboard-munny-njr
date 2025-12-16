import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, AlertCircle } from 'lucide-react';
import { parseExcelFile } from '../services/dataProcessing';
import { CleanedSaleRecord } from '../types';

interface DataUploaderProps {
  onDataLoaded: (data: CleanedSaleRecord[]) => void;
}

const DataUploader: React.FC<DataUploaderProps> = ({ onDataLoaded }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await parseExcelFile(file);
      if (data.length === 0) {
        setError("O arquivo parece estar vazio ou não pôde ser lido corretamente.");
      } else {
        onDataLoaded(data);
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao processar o arquivo. Certifique-se de que é um Excel (.xlsx) válido.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="bg-white p-10 rounded-2xl shadow-xl border border-gray-100 max-w-lg w-full">
        <div className="mb-6 flex justify-center">
          <div className="bg-[#f4f6e6] p-4 rounded-full">
            <FileSpreadsheet className="w-12 h-12 text-[#adb85c]" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Importar Relatório de Vendas</h2>
        <p className="text-gray-500 mb-8">
          Carregue o arquivo <code className="bg-gray-100 px-1 py-0.5 rounded text-sm text-gray-700">BD-MIRE_Relat.Prod.Vendido.xlsx</code> para gerar os gráficos.
        </p>

        <div className="relative group">
          <label 
            htmlFor="file-upload" 
            className={`
              flex flex-col items-center justify-center w-full h-32 
              border-2 border-dashed rounded-lg cursor-pointer 
              transition-all duration-300
              ${error ? 'border-red-300 bg-red-50' : 'border-[#adb85c]/30 bg-[#f4f6e6] hover:bg-[#eef2d6]'}
            `}
          >
            {isLoading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-8 h-8 text-[#adb85c] animate-spin mb-2" />
                <span className="text-sm text-[#adb85c] font-medium">Processando dados...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center pt-5 pb-6">
                <Upload className={`w-8 h-8 mb-3 ${error ? 'text-red-500' : 'text-[#adb85c]'}`} />
                <p className="mb-2 text-sm text-gray-600">
                  <span className="font-semibold">Clique para enviar</span>
                </p>
                <p className="text-xs text-gray-400">XLSX, XLS</p>
              </div>
            )}
            <input 
              id="file-upload" 
              type="file" 
              accept=".xlsx, .xls"
              className="hidden" 
              onChange={handleFileChange}
              disabled={isLoading}
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataUploader;