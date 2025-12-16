import React, { useState } from 'react';
import DataUploader from './components/DataUploader';
import Dashboard from './components/Dashboard';
import { CleanedSaleRecord } from './types';

const App: React.FC = () => {
  const [data, setData] = useState<CleanedSaleRecord[] | null>(null);

  const handleDataLoaded = (loadedData: CleanedSaleRecord[]) => {
    setData(loadedData);
  };

  const handleReset = () => {
    setData(null);
  };

  return (
    <div className="font-sans text-gray-900 bg-[#e5eaf3] min-h-screen">
      {!data ? (
        <main className="container mx-auto px-4 py-8">
          <div className="text-center mb-12 mt-10">
            <h1 className="text-5xl font-extrabold text-[#adb85c] mb-4 tracking-tight">
              MUNNY <span className="text-gray-600 font-light">Analytics</span>
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            
            </p>
          </div>
          <DataUploader onDataLoaded={handleDataLoaded} />
        </main>
      ) : (
        <Dashboard data={data} onReset={handleReset} />
      )}
    </div>
  );
};

export default App;


